import { OpenAI as OpenAIClient } from "openai";
import { Run } from "openai/resources/beta/threads/index";
import { Runnable } from "../../schema/runnable/base.js";
import { sleep } from "../../util/time.js";
import { RunnableConfig } from "../../schema/runnable/config.js";
import {
  OutputType,
  OpenAIAssistantFinish,
  OpenAIAssistantAction,
  OpenAIToolType,
} from "./schema.js";
import { Tool } from "../../tools/base.js";

export class OpenAIAssistantRunnable<
  RunInput extends Record<string, any>,
  RunOutput extends OutputType
> extends Runnable<RunInput, RunOutput> {
  lc_namespace = ["langchain", "beta", "openai_assistant"];

  private client: OpenAIClient;

  assistantId: string;

  pollIntervalMs = 5000;

  asAgent = false;

  constructor(fields: { client: OpenAIClient; assistantId: string }) {
    super();
    this.client = fields.client || new OpenAIClient();
    this.assistantId = fields.assistantId;
  }

  static async create<
    RunInput extends Record<string, any>,
    RunOutput extends OutputType
  >({
    model,
    name,
    instructions,
    tools,
    client,
  }: {
    model: string;
    name?: string;
    instructions?: string;
    tools?: OpenAIToolType | Array<Tool>;
    client?: OpenAIClient;
    asAgent?: boolean;
  }) {
    const castTools = tools as OpenAIToolType;
    const oaiClient = client ?? new OpenAIClient();
    const assistant = await oaiClient.beta.assistants.create({
      name,
      instructions,
      tools: castTools,
      model,
    });

    return new this<RunInput, RunOutput>({
      client: oaiClient,
      assistantId: assistant.id,
    });
  }

  async invoke(input: RunInput, _options?: RunnableConfig): Promise<RunOutput> {
    const parsedInput = this._parseInput(input);

    let run: Run;
    if (!("threadId" in parsedInput)) {
      const thread = {
        messages: [
          {
            role: "user",
            content: parsedInput.content,
            file_ids: parsedInput.fileIds,
            metadata: parsedInput.messagesMetadata,
          },
        ],
        metadata: parsedInput.threadMetadata,
      };
      run = await this._createThreadAndRun({
        ...input,
        thread,
      });
    } else if (!("runId" in parsedInput)) {
      await this.client.beta.threads.messages.create(parsedInput.threadId, {
        content: parsedInput.content,
        role: "user",
        file_ids: parsedInput.file_ids,
        metadata: parsedInput.messagesMetadata,
      });
      run = await this._createRun(input);
    } else {
      run = await this.client.beta.threads.runs.submitToolOutputs(
        parsedInput.threadId,
        parsedInput.runId,
        parsedInput.toolOutputs
      );
    }

    return this._getResponse(run.id, run.thread_id) as unknown as RunOutput;
  }

  private _parseInput(input: RunInput): RunInput {
    let newInput;
    if (this.asAgent && input.intermediate_steps) {
      const lastStep =
        input.intermediate_steps[input.intermediate_steps.length - 1];
      const [lastAction, lastOutput] = lastStep;
      newInput = {
        tool_outputs: [
          { output: lastOutput, tool_call_id: lastAction.tool_call_id },
        ],
        run_id: lastAction.run_id,
        thread_id: lastAction.thread_id,
      };
    }
    return (newInput ?? input) as RunInput;
  }

  private async _createRun({
    instructions,
    model,
    tools,
    metadata,
    threadId,
  }: RunInput) {
    const run = this.client.beta.threads.runs.create(threadId, {
      assistant_id: this.assistantId,
      instructions,
      model,
      tools,
      metadata,
    });
    return run;
  }

  private async _createThreadAndRun(input: RunInput) {
    const run = this.client.beta.threads.createAndRun({
      metadata: input.threadMetadata,
      model: input.model,
      tools: input.tools,
      thread: input.thread,
      instructions: input.instructions,
      assistant_id: this.assistantId,
    });
    return run;
  }

  private async _waitForRun(runId: string, threadId: string) {
    let inProgress = true;
    let run = {} as Run;
    while (inProgress) {
      run = await this.client.beta.threads.runs.retrieve(threadId, runId);
      console.log("waiting", run);
      inProgress = ["in_progress", "queued"].includes(run.status);
      if (inProgress) {
        await sleep(this.pollIntervalMs);
      } else {
        console.log("not in progress or queued.");
      }
    }
    return run;
  }

  private async _getResponse(
    runId: string,
    threadId: string
  ): Promise<OutputType> {
    const run = await this._waitForRun(runId, threadId);
    console.log("_getResponse run", run);
    if (run.status === "completed") {
      console.log("completed");
      const messages = await this.client.beta.threads.messages.list(threadId, {
        order: "asc",
      });
      const newMessages = messages.data.filter((msg) => msg.run_id === runId);
      if (!this.asAgent) {
        return newMessages;
      }
      const answer = newMessages.flatMap((msg) => msg.content);
      if (answer.every((item) => item.type === "text")) {
        const answerString = answer
          .map((item) => item.type === "text" && item.text.value)
          .join("\n");
        console.log("returning finish");
        return new OpenAIAssistantFinish({
          returnValues: {
            output: answerString,
          },
          log: "",
          runId,
          threadId,
        });
      } else {
        console.log("answer not all text", answer);
      }
    } else if (run.status === "requires_action") {
      if (
        !this.asAgent ||
        !run.required_action?.submit_tool_outputs.tool_calls
      ) {
        return run.required_action?.submit_tool_outputs.tool_calls ?? [];
      }
      const actions: OpenAIAssistantAction[] = [];
      console.log(run.required_action.submit_tool_outputs.tool_calls);
      run.required_action.submit_tool_outputs.tool_calls.forEach((item) => {
        const functionCall = item.function;
        const args = JSON.parse(functionCall.arguments);
        actions.push(
          new OpenAIAssistantAction({
            tool: functionCall.name,
            toolInput: args,
            toolCallId: item.id,
            log: "",
            runId,
            threadId,
          })
        );
      });
      return actions;
    }
    const runInfo = JSON.stringify(run, null, 2);
    throw new Error(
      `Unknown run status ${run.status}.\nFull run info:\n\n${runInfo}`
    );
  }
}
