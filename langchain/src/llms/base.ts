import { InMemoryCache } from "../cache/index.js";
import {
  AIMessage,
  BaseCache,
  BaseMessage,
  BasePromptValue,
  Generation,
  GenerationChunk,
  LLMResult,
  RUN_KEY,
} from "../schema/index.js";
import {
  BaseLanguageModel,
  BaseLanguageModelCallOptions,
  BaseLanguageModelInput,
  BaseLanguageModelParams,
} from "../base_language/index.js";
import {
  BaseCallbackConfig,
  CallbackManager,
  CallbackManagerForLLMRun,
  Callbacks,
} from "../callbacks/manager.js";
import { getBufferString } from "../memory/base.js";

export type SerializedLLM = {
  _model: string;
  _type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} & Record<string, any>;

export interface BaseLLMParams extends BaseLanguageModelParams {
  /**
   * @deprecated Use `maxConcurrency` instead
   */
  concurrency?: number;
  cache?: BaseCache | boolean;
}

export interface BaseLLMCallOptions extends BaseLanguageModelCallOptions {}

/**
 * LLM Wrapper. Provides an {@link call} (an {@link generate}) function that takes in a prompt (or prompts) and returns a string.
 */
export abstract class BaseLLM<
  CallOptions extends BaseLLMCallOptions = BaseLLMCallOptions
> extends BaseLanguageModel<CallOptions, string> {
  declare ParsedCallOptions: Omit<
    CallOptions,
    "timeout" | "tags" | "metadata" | "callbacks"
  >;

  lc_namespace = ["langchain", "llms", this._llmType()];

  cache?: BaseCache;

  constructor({ cache, concurrency, ...rest }: BaseLLMParams) {
    super(concurrency ? { maxConcurrency: concurrency, ...rest } : rest);
    if (typeof cache === "object") {
      this.cache = cache;
    } else if (cache) {
      this.cache = InMemoryCache.global();
    } else {
      this.cache = undefined;
    }
  }

  async invoke(
    input: BaseLanguageModelInput,
    options?: CallOptions
  ): Promise<string> {
    const promptValue = BaseLLM._convertInputToPromptValue(input);
    const result = await this.generatePrompt(
      [promptValue],
      options,
      options?.callbacks
    );
    return result.generations[0][0].text;
  }

  async *_stream(
    input: string,
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<GenerationChunk> {
    const result = await this._generate([input], options, runManager);
    yield result.generations[0][0];
  }

  async *_createStreamAsyncGenerator(
    input: BaseLanguageModelInput,
    options?: CallOptions
  ): AsyncGenerator<string> {
    const prompt = BaseLLM._convertInputToPromptValue(input);
    const callbackManager_ = await CallbackManager.configure(
      options?.callbacks,
      this.callbacks,
      options?.tags,
      this.tags,
      options?.metadata,
      this.metadata,
      { verbose: this.verbose }
    );
    let parsedOptions: CallOptions;
    if (options?.timeout && !options.signal) {
      parsedOptions = {
        ...options,
        signal: AbortSignal.timeout(options.timeout),
      };
    } else {
      parsedOptions = (options ?? {}) as CallOptions;
    }
    delete parsedOptions.tags;
    delete parsedOptions.metadata;
    delete parsedOptions.callbacks;
    const extra = {
      options: parsedOptions,
      invocation_params: this?.invocationParams(parsedOptions),
    };
    const runManagers = await callbackManager_?.handleLLMStart(
      this.toJSON(),
      [prompt.toString()],
      undefined,
      undefined,
      extra
    );
    let generation: GenerationChunk = {
      text: "",
    };
    try {
      for await (const chunk of this._stream(
        input.toString(),
        parsedOptions,
        runManagers?.[0]
      )) {
        if (!generation) {
          generation = chunk;
        } else {
          generation.text += chunk.text;
          generation.generationInfo =
            chunk.generationInfo ?? generation.generationInfo;
        }
        yield chunk.text;
      }
    } catch (err) {
      await Promise.all(
        (runManagers ?? []).map((runManager) => runManager?.handleLLMError(err))
      );
      throw err;
    }
    await Promise.all(
      (runManagers ?? []).map((runManager) =>
        runManager?.handleLLMEnd({
          generations: [[generation]],
        })
      )
    );
  }

  async generatePrompt(
    promptValues: BasePromptValue[],
    options?: string[] | CallOptions,
    callbacks?: Callbacks
  ): Promise<LLMResult> {
    const prompts: string[] = promptValues.map((promptValue) =>
      promptValue.toString()
    );
    return this.generate(prompts, options, callbacks);
  }

  /**
   * Run the LLM on the given prompts and input.
   */
  abstract _generate(
    prompts: string[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<LLMResult>;

  /**
   * Get the parameters used to invoke the model
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invocationParams(_options?: this["ParsedCallOptions"]): any {
    return {};
  }

  _flattenLLMResult(llmResult: LLMResult): LLMResult[] {
    const llmResults: LLMResult[] = [];

    for (let i = 0; i < llmResult.generations.length; i += 1) {
      const genList = llmResult.generations[i];

      if (i === 0) {
        llmResults.push({
          generations: [genList],
          llmOutput: llmResult.llmOutput,
        });
      } else {
        const llmOutput = llmResult.llmOutput
          ? { ...llmResult.llmOutput, tokenUsage: {} }
          : undefined;

        llmResults.push({
          generations: [genList],
          llmOutput,
        });
      }
    }

    return llmResults;
  }

  /** @ignore */
  async _generateUncached(
    prompts: string[],
    parsedOptions: this["ParsedCallOptions"],
    handledOptions: BaseCallbackConfig
  ): Promise<LLMResult> {
    const callbackManager_ = await CallbackManager.configure(
      handledOptions.callbacks,
      this.callbacks,
      handledOptions.tags,
      this.tags,
      handledOptions.metadata,
      this.metadata,
      { verbose: this.verbose }
    );
    const extra = {
      options: parsedOptions,
      invocation_params: this?.invocationParams(parsedOptions),
    };
    const runManagers = await callbackManager_?.handleLLMStart(
      this.toJSON(),
      prompts,
      undefined,
      undefined,
      extra
    );

    let output;
    try {
      output = await this._generate(prompts, parsedOptions, runManagers?.[0]);
    } catch (err) {
      await Promise.all(
        (runManagers ?? []).map((runManager) => runManager?.handleLLMError(err))
      );
      throw err;
    }

    const flattenedOutputs: LLMResult[] = this._flattenLLMResult(output);
    await Promise.all(
      (runManagers ?? []).map((runManager, i) =>
        runManager?.handleLLMEnd(flattenedOutputs[i])
      )
    );
    const runIds = runManagers?.map((manager) => manager.runId) || undefined;
    // This defines RUN_KEY as a non-enumerable property on the output object
    // so that it is not serialized when the output is stringified, and so that
    // it isnt included when listing the keys of the output object.
    Object.defineProperty(output, RUN_KEY, {
      value: runIds ? { runIds } : undefined,
      configurable: true,
    });
    return output;
  }

  /**
   * Run the LLM on the given prompts and input, handling caching.
   */
  async generate(
    prompts: string[],
    options?: string[] | CallOptions,
    callbacks?: Callbacks
  ): Promise<LLMResult> {
    if (!Array.isArray(prompts)) {
      throw new Error("Argument 'prompts' is expected to be a string[]");
    }

    let parsedOptions: CallOptions;
    if (Array.isArray(options)) {
      parsedOptions = { stop: options } as CallOptions;
    } else if (options?.timeout && !options.signal) {
      parsedOptions = {
        ...options,
        signal: AbortSignal.timeout(options.timeout),
      };
    } else {
      parsedOptions = (options ?? {}) as CallOptions;
    }
    const handledOptions: BaseCallbackConfig = {
      tags: parsedOptions.tags,
      metadata: parsedOptions.metadata,
      callbacks: parsedOptions.callbacks ?? callbacks,
    };
    delete parsedOptions.tags;
    delete parsedOptions.metadata;
    delete parsedOptions.callbacks;

    if (!this.cache) {
      return this._generateUncached(prompts, parsedOptions, handledOptions);
    }

    const { cache } = this;
    const params = this.serialize();
    params.stop = parsedOptions.stop ?? params.stop;

    const llmStringKey = `${Object.entries(params).sort()}`;
    const missingPromptIndices: number[] = [];
    const generations = await Promise.all(
      prompts.map(async (prompt, index) => {
        const result = await cache.lookup(prompt, llmStringKey);
        if (!result) {
          missingPromptIndices.push(index);
        }
        return result;
      })
    );

    let llmOutput = {};
    if (missingPromptIndices.length > 0) {
      const results = await this._generateUncached(
        missingPromptIndices.map((i) => prompts[i]),
        parsedOptions,
        handledOptions
      );
      await Promise.all(
        results.generations.map(async (generation, index) => {
          const promptIndex = missingPromptIndices[index];
          generations[promptIndex] = generation;
          return cache.update(prompts[promptIndex], llmStringKey, generation);
        })
      );
      llmOutput = results.llmOutput ?? {};
    }

    return { generations, llmOutput } as LLMResult;
  }

  /**
   * Convenience wrapper for {@link generate} that takes in a single string prompt and returns a single string output.
   */
  async call(
    prompt: string,
    options?: string[] | CallOptions,
    callbacks?: Callbacks
  ): Promise<string> {
    const { generations } = await this.generate([prompt], options, callbacks);
    return generations[0][0].text;
  }

  async predict(
    text: string,
    options?: string[] | CallOptions,
    callbacks?: Callbacks
  ): Promise<string> {
    return this.call(text, options, callbacks);
  }

  async predictMessages(
    messages: BaseMessage[],
    options?: string[] | CallOptions,
    callbacks?: Callbacks
  ): Promise<BaseMessage> {
    const text = getBufferString(messages);
    const prediction = await this.call(text, options, callbacks);
    return new AIMessage(prediction);
  }

  /**
   * Get the identifying parameters of the LLM.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _identifyingParams(): Record<string, any> {
    return {};
  }

  /**
   * Return the string type key uniquely identifying this class of LLM.
   */
  abstract _llmType(): string;

  /**
   * Return a json-like object representing this LLM.
   */
  serialize(): SerializedLLM {
    return {
      ...this._identifyingParams(),
      _type: this._llmType(),
      _model: this._modelType(),
    };
  }

  _modelType(): string {
    return "base_llm" as const;
  }

  /**
   * Load an LLM from a json-like object describing it.
   */
  static async deserialize(data: SerializedLLM): Promise<BaseLLM> {
    const { _type, _model, ...rest } = data;
    if (_model && _model !== "base_llm") {
      throw new Error(`Cannot load LLM with model ${_model}`);
    }
    const Cls = {
      openai: (await import("./openai.js")).OpenAI,
    }[_type];
    if (Cls === undefined) {
      throw new Error(`Cannot load  LLM with type ${_type}`);
    }
    return new Cls(rest);
  }
}

/**
 * LLM class that provides a simpler interface to subclass than {@link BaseLLM}.
 *
 * Requires only implementing a simpler {@link _call} method instead of {@link _generate}.
 *
 * @augments BaseLLM
 */
export abstract class LLM<
  CallOptions extends BaseLLMCallOptions = BaseLLMCallOptions
> extends BaseLLM<CallOptions> {
  /**
   * Run the LLM on the given prompt and input.
   */
  abstract _call(
    prompt: string,
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<string>;

  async _generate(
    prompts: string[],
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<LLMResult> {
    const generations: Generation[][] = await Promise.all(
      prompts.map((prompt, promptIndex) =>
        this._call(prompt, { ...options, promptIndex }, runManager).then(
          (text) => [{ text }]
        )
      )
    );
    return { generations };
  }
}
