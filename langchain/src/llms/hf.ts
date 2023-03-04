import { LLM, LLMCallbackManager } from "./index.js";

interface HFInput {
  /** Model to use */
  model: string;
}

export class HuggingFaceInference extends LLM implements HFInput {
  model = "gpt2";

  constructor(
    fields?: Partial<HFInput> & {
      callbackManager?: LLMCallbackManager;
      verbose?: boolean;
      concurrency?: number;
      cache?: boolean;
    }
  ) {
    super(
      fields?.callbackManager,
      fields?.verbose,
      fields?.concurrency,
      fields?.cache
    );
    this.model = fields?.model ?? this.model;
  }

  _llmType() {
    return "huggingface_hub";
  }

  async _call(prompt: string, _stop?: string[]): Promise<string> {
    if (process.env.HUGGINGFACEHUB_API_KEY === "") {
      throw new Error(
        "Please set the HUGGINGFACEHUB_API_KEY environment variable"
      );
    }
    const { HfInference } = await HuggingFaceInference.imports();
    const hf = new HfInference(process.env.HUGGINGFACEHUB_API_KEY ?? "");
    const res = await hf.textGeneration({
      model: this.model,
      inputs: prompt,
    });
    return res.generated_text;
  }

  static async imports(): Promise<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    HfInference: any;
  }> {
    try {
      const { HfInference } = await import("@huggingface/inference");
      return { HfInference };
    } catch (e) {
      throw new Error(
        "Please install huggingface as a dependency with, e.g. `yarn add huggingface`"
      );
    }
  }
}
