import { OpenAI } from "langchain";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { SerpAPI, Calculator } from "langchain/tools";
import process from "process";

export const run = async () => {
  process.env.LANGCHAIN_HANDLER = "langchain";
  const model = new OpenAI({ temperature: 0 });
  const tools = [new SerpAPI(), new Calculator()];

  const executor = await initializeAgentExecutorWithOptions(tools, model, {
    agentType: "zero-shot-react-description",
    verbose: true,
  });
  console.log("Loaded agent.");

  const input = `Who is Olivia Wilde's boyfriend? What is his current age raised to the 0.23 power?`;

  console.log(`Executing with input "${input}"...`);

  const result = await executor.call({ input });

  console.log(`Got output ${result.output}`);
};
