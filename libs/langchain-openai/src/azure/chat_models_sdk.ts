import {
  type OpenAIClientOptions as AzureOpenAIClientOptions,
  OpenAIClient as AzureOpenAIClient,
  AzureKeyCredential,
  FunctionDefinition,
  FunctionCallPreset,
  FunctionName,
  AzureExtensionsOptions,
  ChatChoice,
} from "@azure/openai";
import { OpenAI as OpenAIClient } from "openai";
import { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { GenerationChunk } from "@langchain/core/outputs";
import { getEnvironmentVariable } from "@langchain/core/utils/env";
// import { promptLayerTrackRequest } from "../util/prompt-layer.js";
import { LLM, type BaseLLMParams } from "@langchain/core/language_models/llms";
import { AzureOpenAIInput, OpenAIChatInput } from "../types.js";
import { OpenAIChatCallOptions } from "../legacy.js";

export { type AzureOpenAIInput, type OpenAIChatInput };

/**
 * Wrapper around OpenAI large language models that use the Chat endpoint.
 *
 * To use you should have the `openai` package installed, with the
 * `OPENAI_API_KEY` environment variable set.
 *
 * To use with Azure you should have the `openai` package installed, with the
 * `AZURE_OPENAI_API_KEY`,
 * `AZURE_OPENAI_API_INSTANCE_NAME`,
 * `AZURE_OPENAI_API_DEPLOYMENT_NAME`
 * and `AZURE_OPENAI_API_VERSION` environment variable set.
 *
 * @remarks
 * Any parameters that are valid to be passed to {@link
 * https://platform.openai.com/docs/api-reference/chat/create |
 * `openai.createCompletion`} can be passed through {@link modelKwargs}, even
 * if not explicitly available on this class.
 *
 * @augments BaseLLM
 * @augments OpenAIInput
 * @augments AzureOpenAIChatInput
 * @example
 * ```typescript
 * const model = new OpenAIChat({
 *   prefixMessages: [
 *     {
 *       role: "system",
 *       content: "You are a helpful assistant that answers in pirate language",
 *     },
 *   ],
 *   maxTokens: 50,
 * });
 *
 * const res = await model.call(
 *   "What would be a good company name for a company that makes colorful socks?"
 * );
 * console.log({ res });
 * ```
 */
export class AzureSDKChatOpenAI
  extends LLM<OpenAIChatCallOptions>
  implements OpenAIChatInput, AzureOpenAIInput
{
  static lc_name() {
    return "AzureOpenAIChat";
  }

  get callKeys() {
    return [...super.callKeys, "options", "promptIndex"];
  }

  lc_serializable = true;

  get lc_secrets(): { [key: string]: string } | undefined {
    return {
      azureOpenAIApiKey: "AZURE_OPENAI_API_KEY",
      azureOpenAIEndpoint: "AZURE_OPENAI_API_ENDPOINT",
      azureOpenAIApiDeploymentName: "AZURE_OPENAI_API_DEPLOYMENT_NAME",
    };
  }

  get lc_aliases(): Record<string, string> {
    return {
      modelName: "model",
      azureOpenAIApiKey: "azure_openai_api_key",
      azureOpenAIEndpoint: "azure_openai_api_endpoint",
      azureOpenAIApiDeploymentName: "azure_openai_api_deployment_name",
    };
  }

  _llmType() {
    return "openai";
  }

  temperature = 1;

  topP = 1;

  frequencyPenalty = 0;

  presencePenalty = 0;

  n = 1;

  logitBias?: Record<string, number>;

  maxTokens?: number;

  modelName = "gpt-3.5-turbo";

  prefixMessages?: OpenAIClient.Chat.ChatCompletionMessageParam[];

  modelKwargs?: OpenAIChatInput["modelKwargs"];

  timeout?: number;

  stop?: string[];

  user?: string;

  streaming = false;

  functions?: FunctionDefinition[];

  functionCall?: FunctionCallPreset | FunctionName;

  azureExtensionOptions?: AzureExtensionsOptions;

  azureOpenAIEndpoint?: string;

  azureOpenAIApiKey?: string;

  azureOpenAIApiCompletionsDeploymentName?: string;

  private client: AzureOpenAIClient;

  constructor(
    fields?: Partial<OpenAIChatInput> &
      Partial<AzureOpenAIInput> &
      BaseLLMParams & {
        configuration?: AzureOpenAIClientOptions;
      }
  ) {
    super(fields ?? {});

    this.azureOpenAIEndpoint =
      fields?.azureOpenAIEndpoint ??
      getEnvironmentVariable("AZURE_OPENAI_API_ENDPOINT");

    this.azureOpenAIApiCompletionsDeploymentName =
      fields?.azureOpenAIApiDeploymentName ??
      getEnvironmentVariable("AZURE_OPENAI_API_DEPLOYMENT_NAME");

    this.azureOpenAIApiKey =
      fields?.azureOpenAIApiKey ??
      getEnvironmentVariable("AZURE_OPENAI_API_KEY");

    if (!this.azureOpenAIApiKey) {
      throw new Error("Azure OpenAI API key not found");
    }

    if (!this.azureOpenAIEndpoint) {
      throw new Error("Azure OpenAI Endpoint not found");
    }

    if (!this.azureOpenAIApiCompletionsDeploymentName) {
      throw new Error("Azure OpenAI Completion Deployment name not found");
    }

    this.modelName = fields?.modelName ?? this.modelName;
    this.prefixMessages = fields?.prefixMessages ?? this.prefixMessages;
    this.modelKwargs = fields?.modelKwargs ?? {};
    this.timeout = fields?.timeout;

    this.temperature = fields?.temperature ?? this.temperature;
    this.topP = fields?.topP ?? this.topP;
    this.frequencyPenalty = fields?.frequencyPenalty ?? this.frequencyPenalty;
    this.presencePenalty = fields?.presencePenalty ?? this.presencePenalty;
    this.n = fields?.n ?? this.n;
    this.logitBias = fields?.logitBias;
    this.maxTokens = fields?.maxTokens;
    this.stop = fields?.stop;
    this.user = fields?.user;
    this.functions = fields?.functions;
    this.functionCall = fields?.functionCall;
    this.azureExtensionOptions = fields?.azureExtensionOptions;

    this.streaming = fields?.streaming ?? false;

    if (this.n > 1) {
      throw new Error(
        "Cannot use n > 1 in OpenAIChat LLM. Use ChatOpenAI Chat Model instead."
      );
    }

    if (this.azureOpenAIApiKey) {
      if (!this.azureOpenAIApiCompletionsDeploymentName) {
        throw new Error("Azure OpenAI API deployment name not found");
      }
      this.azureOpenAIApiKey = this.azureOpenAIApiKey ?? "";
    }

    const azureKeyCredential: AzureKeyCredential = new AzureKeyCredential(
      this.azureOpenAIApiKey
    );
    this.client = new AzureOpenAIClient(
      this.azureOpenAIEndpoint ?? "",
      azureKeyCredential
    );
  }

  async *_streamResponseChunks(
    content: string,
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<GenerationChunk> {
    if (!this.azureOpenAIApiCompletionsDeploymentName) {
      throw new Error("Azure OpenAI Completion Deployment name not found");
    }

    const streams = await this.client.streamChatCompletions(
      this.azureOpenAIApiCompletionsDeploymentName,
      [
        {
          content,
          role: "user",
        },
      ],
      {
        functions: this.functions,
        functionCall: this.functionCall,
        maxTokens: this.maxTokens,
        temperature: this.temperature,
        topP: this.topP,
        logitBias: this.logitBias,
        user: this.user,
        n: this.n,
        stop: this.stop,
        presencePenalty: this.presencePenalty,
        frequencyPenalty: this.frequencyPenalty,
        azureExtensionOptions: this.azureExtensionOptions,
        requestOptions: {
          timeout: options?.timeout,
        },
        abortSignal: options?.signal ?? undefined,
      }
    );

    for await (const data of streams) {
      const choice: ChatChoice = data?.choices[0];
      if (!choice) {
        continue;
      }
      const { delta } = choice;
      const generationChunk = new GenerationChunk({
        text: delta?.content ?? "",
      });
      yield generationChunk;
      const newTokenIndices = {
        prompt: options.promptIndex ?? 0,
        completion: choice.index ?? 0,
      };
      // eslint-disable-next-line no-void
      void runManager?.handleLLMNewToken(
        generationChunk.text ?? "",
        newTokenIndices
      );
    }
    if (options.signal?.aborted) {
      throw new Error("AbortError");
    }
  }

  /** @ignore */
  async _call(
    content: string,
    options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun
  ): Promise<string> {
    if (!this.azureOpenAIApiCompletionsDeploymentName) {
      throw new Error("Azure OpenAI Completion Deployment name not found");
    }

    if (!this.streaming) {
      const data = await this.client.getChatCompletions(
        this.azureOpenAIApiCompletionsDeploymentName,
        [
          {
            content,
            role: "user",
          },
        ],
        {
          functions: this.functions,
          functionCall: this.functionCall,
          maxTokens: this.maxTokens,
          temperature: this.temperature,
          topP: this.topP,
          logitBias: this.logitBias,
          user: this.user,
          n: this.n,
          stop: this.stop,
          presencePenalty: this.presencePenalty,
          frequencyPenalty: this.frequencyPenalty,
          azureExtensionOptions: this.azureExtensionOptions,
          requestOptions: {
            timeout: options?.timeout,
          },
          abortSignal: options?.signal ?? undefined,
        }
      );

      data.choices.map((choice) => {
        const newTokenIndices = {
          prompt: options.promptIndex ?? 0,
          completion: choice.index ?? 0,
        };
        void runManager?.handleLLMNewToken(
          choice.delta?.content ?? "",
          newTokenIndices
        );
        return choice;
      });

      return data.choices[0].message?.content ?? "";
    } else {
      const streams = await this.client.streamChatCompletions(
        this.azureOpenAIApiCompletionsDeploymentName,
        [
          {
            content,
            role: "user",
          },
        ],
        {
          functions: this.functions,
          functionCall: this.functionCall,
          maxTokens: this.maxTokens,
          temperature: this.temperature,
          topP: this.topP,
          logitBias: this.logitBias,
          user: this.user,
          n: this.n,
          stop: this.stop,
          presencePenalty: this.presencePenalty,
          frequencyPenalty: this.frequencyPenalty,
          azureExtensionOptions: this.azureExtensionOptions,
          requestOptions: {
            timeout: options?.timeout,
          },
          abortSignal: options?.signal ?? undefined,
        }
      );
      let result: string | null | undefined = null;
      for await (const stream of streams) {
        for (const choice of stream.choices) {
          const delta = choice.delta?.content;
          if (result == null) {
            result = delta;
          } else {
            result = result.concat(delta ?? "");
          }
          const newTokenIndices = {
            prompt: options.promptIndex ?? 0,
            completion: choice.index ?? 0,
          };
          void runManager?.handleLLMNewToken(
            choice.delta?.content ?? "",
            newTokenIndices
          );
        }
      }
      return result ?? "";
    }
  }
}
