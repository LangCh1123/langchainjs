import { getEnvironmentVariable } from "../util/env.js";
import { LLM, BaseLLMParams } from "./base.js";

/**
 * Interface for the input parameters specific to the Cohere model.
 */
export interface CohereInput extends BaseLLMParams {
  /** Sampling temperature to use */
  temperature?: number;

  /**
   * Maximum number of tokens to generate in the completion.
   */
  maxTokens?: number;

  /** Model to use */
  model?: string;

  apiKey?: string;
}

/**
 * Class representing a Cohere Large Language Model (LLM). It interacts
 * with the Cohere API to generate text completions.
 */
export class Cohere extends LLM implements CohereInput {
  static lc_name() {
    return "Cohere";
  }

  get lc_secrets(): { [key: string]: string } | undefined {
    return {
      apiKey: "COHERE_API_KEY",
    };
  }

  get lc_aliases(): { [key: string]: string } | undefined {
    return {
      apiKey: "cohere_api_key",
    };
  }

  lc_serializable = true;

  temperature = 0;

  maxTokens = 250;

  model: string;

  apiKey: string;

  constructor(fields?: CohereInput) {
    super(fields ?? {});

    const apiKey = fields?.apiKey ?? getEnvironmentVariable("COHERE_API_KEY");

    if (!apiKey) {
      throw new Error(
        "Please set the COHERE_API_KEY environment variable or pass it to the constructor as the apiKey field."
      );
    }

    this.apiKey = apiKey;
    this.maxTokens = fields?.maxTokens ?? this.maxTokens;
    this.temperature = fields?.temperature ?? this.temperature;
    this.model = fields?.model ?? this.model;
  }

  _llmType() {
    return "cohere";
  }

  /** @ignore */
  async _call(
    prompt: string,
    options: this["ParsedCallOptions"]
  ): Promise<string> {
    const { CohereClient } = await Cohere.imports();

    const cohere = new CohereClient({
      token: this.apiKey,
    });

    // Hit the `generate` endpoint on the `large` model
    const generateResponse = await this.caller.callWithOptions(
      { signal: options.signal },
      cohere.generate.bind(cohere),
      {
        prompt,
        model: this.model,
        maxTokens: this.maxTokens,
        temperature: this.temperature,
        endSequences: options.stop,
      }
    );
    try {
      return generateResponse.generations[0].text;
    } catch {
      console.log(generateResponse);
      throw new Error("Could not parse response.");
    }
  }

  /** @ignore */
  static async imports(): Promise<{
    CohereClient: typeof import("cohere-ai").CohereClient;
  }> {
    try {
      const { CohereClient } = await import("cohere-ai");
      return { CohereClient };
    } catch (e) {
      throw new Error(
        "Please install cohere-ai as a dependency with, e.g. `yarn add cohere-ai`"
      );
    }
  }
}
