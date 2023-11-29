import { OpenAI } from "langchain/llms/openai";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { DiscordSendMessagesTool } from "langchain/tools/discord";
import { DadJokeAPI } from "langchain/tools";

export default async function run() {
  const model = new OpenAI({
    temperature: 0,
  });

  const tools = [
    new DiscordSendMessagesTool("1153400523718938780"),
    new DadJokeAPI(),
  ];

  const executor = await initializeAgentExecutorWithOptions(tools, model, {
    agentType: "zero-shot-react-description",
    verbose: true,
  });

  const res = await executor.call({
    input: `Tell a joke in the discord channel`,
  });

  console.log(res.output);
  // "What's the best thing about elevator jokes? They work on so many levels."
}
