import { AgentAction, AgentFinish } from "@langchain/core/agents";
import { OutputParserException } from "@langchain/core/output_parsers";
import { AgentActionOutputParser } from "../types.js";

/**
 * @example
 * ```typescript
 * const prompt = ChatPromptTemplate.fromMessages([
 *   HumanMessagePromptTemplate.fromTemplate(AGENT_INSTRUCTIONS),
 *   new MessagesPlaceholder("agent_scratchpad"),
 * ]);
 * const runnableAgent = RunnableSequence.from([
 *   ...rest of runnable
 *   prompt,
 *   new ChatAnthropic({ modelName: "claude-2", temperature: 0 }).bind({
 *     stop: ["</tool_input>", "</final_answer>"],
 *   }),
 *   new XMLAgentOutputParser(),
 * ]);
 * const result = await executor.invoke({
 *   input: "What is the weather in Honolulu?",
 *   tools: [],
 * });
 * ```
 */
export class XMLAgentOutputParser extends AgentActionOutputParser {
  lc_namespace = ["langchain", "agents", "xml"];

  static lc_name() {
    return "XMLAgentOutputParser";
  }

  /**
   * Parses the output text from the agent and returns an AgentAction or
   * AgentFinish object.
   * @param text The output text from the agent.
   * @returns An AgentAction or AgentFinish object.
   */
  async parse(text: string): Promise<AgentAction | AgentFinish> {
    if (text.includes("</tool>")) {
      const _tool = text.match(/<tool>([^<]*)<\/tool>/)[1];
      const _toolInput = text.match(/<tool_input>([^<]*)<\/tool_input>/)[1];
      return { tool: _tool, toolInput: _toolInput, log: text };
    } else if (text.includes("<final_answer>")) {
      const answer = text.match(/<final_answer>([^<]*)<\/final_answer>/)[1];
      return { returnValues: { output: answer }, log: text };
    } else {
      throw new OutputParserException(`Could not parse LLM output: ${text}`);
    }
  }

  getFormatInstructions(): string {
    throw new Error(
      "getFormatInstructions not implemented inside OpenAIFunctionsAgentOutputParser."
    );
  }
}
