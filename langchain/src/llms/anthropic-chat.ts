import {
  AI_PROMPT,
  HUMAN_PROMPT,
  Client as AnthropicApi,
  CompletionResponse,
  SamplingParameters,
} from "@anthropic-ai/sdk";
import { backOff } from "exponential-backoff";
import { BaseLLMParams, LLM } from "./base.js";

interface FormattedRequestMessage {
  role: "user" | "assistant";
  content: string;
}

interface ModelParams {
  /** Amount of randomness injected into the response. Ranges
   * from 0 to 1. Use temp closer to 0 for analytical /
   * multiple choice, and temp closer to 1 for creative
   * and generative tasks.
   */
  temperature?: number;

  /** Only sample from the top K options for each subsequent
   * token. Used to remove "long tail" low probability
   * responses. Defaults to -1, which disables it.
   */
  topK?: number;

  /** Does nucleus sampling, in which we compute the
   * cumulative distribution over all the options for each
   * subsequent token in decreasing probability order and
   * cut it off once it reaches a particular probability
   * specified by top_p. Defaults to -1, which disables it.
   * Note that you should either alter temperature or top_p,
   * but not both.
   */
  topP?: number;

  /** A maximum number of tokens to generate before stopping. */
  maxTokensToSample: number;

  /** A list of strings upon which to stop generating.
   * You probably want ["\n\nHuman:"], as that's the cue for
   * the next turn in the dialog agent.
   */
  stopSequences?: string[];

  /** Whether to stream the results or not */
  streaming?: boolean;
}

/**
 * Input to AnthropicChat class.
 * @augments ModelParams
 */
interface AnthropicInput extends ModelParams {
  /** Anthropic API key */
  apiKey?: string;

  /** Model name to use */
  modelName: string;

  /** Raw Anthropic prompt prefix. Must end with "\n\nHuman:"
   * and will be ignored if prefixMessages is provided.
   */
  rawPrefix?: string;

  /** Prefix messages in a format similar to OpenAI's
   * ChatCompletionRequestMessage format (an object with role and
   * prompt properties). Only "user" and "assistant" roles are
   * currently supported.
   */
  prefixMessages?: FormattedRequestMessage[];

  /** Holds any additional parameters that are valid to pass to {@link
   * https://console.anthropic.com/docs/api/reference |
   * `anthropic.complete`} that are not explicitly specified on this class.
   */
  invocationKwargs?: Kwargs;

  /** Maximum number of retries to make when generating */
  maxRetries: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Kwargs = Record<string, any>;

/**
 * Wrapper around Anthropic large language models.
 *
 * To use you should have the `anthropic` package installed, with the
 * `ANTHROPIC_API_KEY` environment variable set.
 *
 * @remarks
 * Any parameters that are valid to be passed to {@link
 * https://console.anthropic.com/docs/api/reference |
 * `anthropic.complete`} can be passed through {@link invocationKwargs},
 * even if not explicitly available on this class.
 *
 * @augments BaseLLM
 * @augments AnthropicInput
 */
export class AnthropicChat extends LLM implements AnthropicInput {
  apiKey?: string;

  temperature = 1;

  topK = -1;

  topP = -1;

  maxTokensToSample = 256;

  modelName = "claude-v1";

  rawPrefix?: string;

  prefixMessages?: FormattedRequestMessage[];

  invocationKwargs?: Kwargs;

  maxRetries = 6;

  stopSequences = [HUMAN_PROMPT];

  streaming = false;

  // Used for non-streaming requests
  private batchClient: AnthropicApi;

  // Used for streaming requests
  private streamingClient: AnthropicApi;

  constructor(
    fields?: Partial<AnthropicInput> &
      BaseLLMParams & {
        anthropicApiKey?: string;
      }
  ) {
    super(fields ?? {});

    this.apiKey = fields?.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!this.apiKey) {
      throw new Error("Anthropic API key not found");
    }

    this.modelName = fields?.modelName ?? this.modelName;
    this.rawPrefix = fields?.rawPrefix ?? this.rawPrefix;
    this.prefixMessages = fields?.prefixMessages ?? this.prefixMessages;
    this.invocationKwargs = fields?.invocationKwargs ?? {};
    this.maxRetries = fields?.maxRetries ?? this.maxRetries;

    this.temperature = fields?.temperature ?? this.temperature;
    this.topK = fields?.topK ?? this.topK;
    this.topP = fields?.topP ?? this.topP;
    this.maxTokensToSample =
      fields?.maxTokensToSample ?? this.maxTokensToSample;
    this.stopSequences = fields?.stopSequences ?? this.stopSequences;

    this.streaming = fields?.streaming ?? false;
  }

  /**
   * Get the parameters used to invoke the model
   */
  invocationParams(): Omit<SamplingParameters, "prompt"> & Kwargs {
    return {
      model: this.modelName,
      temperature: this.temperature,
      top_k: this.topK,
      top_p: this.topP,
      stop_sequences: this.stopSequences,
      max_tokens_to_sample: this.maxTokensToSample,
      stream: this.streaming,
      ...this.invocationKwargs,
    };
  }

  _identifyingParams() {
    return {
      model_name: this.modelName,
      ...this.invocationParams(),
    };
  }

  /**
   * Get the identifying parameters for the model
   */
  identifyingParams() {
    return {
      model_name: this.modelName,
      ...this.invocationParams(),
    };
  }

  private formatPrompt(prompt: string): string {
    if (!this.prefixMessages || !this.prefixMessages.length) {
      return [this.rawPrefix ?? HUMAN_PROMPT, prompt].join(" ");
    }
    return this.prefixMessages
      .concat({
        role: "user",
        content: prompt,
      })
      .map((prefixMessage) => {
        const messagePrompt =
          prefixMessage.role === "user" ? HUMAN_PROMPT : AI_PROMPT;
        return `${messagePrompt} ${prefixMessage.content}`;
      })
      .join("");
  }

  /**
   * Call out to Anthropic's endpoint with k unique prompts
   *
   * @param prompt - The prompt to pass into the model.
   * @param [stopSequences] - Optional list of stop sequences to use.
   *
   * @returns The full LLM output.
   */
  async _call(prompt: string, stopSequences?: string[]): Promise<string> {
    if (this.stopSequences && stopSequences) {
      throw new Error(
        'Parameter "stopSequences" found in input and default params'
      );
    }

    const params = this.invocationParams();
    params.stop_sequences = stopSequences ?? params.stop_sequences;

    const response = await this.completionWithRetry({
      ...params,
      prompt: this.formatPrompt(prompt),
    });

    return response.completion ?? "";
  }

  /** @ignore */
  async completionWithRetry(
    request: SamplingParameters & Kwargs
  ): Promise<CompletionResponse> {
    if (!this.apiKey) {
      throw new Error("Missing Anthropic API key.");
    }
    let makeCompletionRequest;
    if (request.stream) {
      if (!this.streamingClient) {
        this.streamingClient = new AnthropicApi(this.apiKey);
      }
      makeCompletionRequest = async () => {
        let currentCompletion = "";
        return this.streamingClient.completeStream(request, {
          onUpdate: (data: CompletionResponse) => {
            if (data.stop_reason) {
              return;
            }
            const part = data.completion;
            if (part) {
              const delta = part.slice(currentCompletion.length);
              currentCompletion += delta ?? "";
              // eslint-disable-next-line no-void
              void this.callbackManager.handleLLMNewToken(delta ?? "", true);
            }
          },
        });
      };
    } else {
      if (!this.batchClient) {
        this.batchClient = new AnthropicApi(this.apiKey);
      }
      makeCompletionRequest = async () => this.batchClient.complete(request);
    }
    return backOff(makeCompletionRequest, {
      startingDelay: 4,
      maxDelay: 10,
      numOfAttempts: this.maxRetries,
    });
  }

  _llmType() {
    return "anthropic";
  }
}

export { AI_PROMPT, HUMAN_PROMPT } from "@anthropic-ai/sdk";
