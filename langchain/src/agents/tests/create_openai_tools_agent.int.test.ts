import { test, expect } from "@jest/globals";
import { ChatOpenAI } from "@langchain/openai";
import type { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda } from "@langchain/core/runnables";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { AsyncLocalStorageProviderSingleton } from "@langchain/core/singletons";
import { AsyncLocalStorage } from "async_hooks";
import { TavilySearchResults } from "../../util/testing/tools/tavily_search.js";
import { pull } from "../../hub.js";
import { AgentExecutor, createOpenAIToolsAgent } from "../index.js";

const tools = [new TavilySearchResults({ maxResults: 1 })];

test("createOpenAIToolsAgent works", async () => {
  const prompt = await pull<ChatPromptTemplate>("hwchase17/openai-tools-agent");
  const llm = new ChatOpenAI({
    modelName: "gpt-3.5-turbo-1106",
    temperature: 0,
  });
  const agent = await createOpenAIToolsAgent({
    llm,
    tools,
    prompt,
  });
  const agentExecutor = new AgentExecutor({
    agent,
    tools,
  });
  const input = "what is LangChain?";
  const result = await agentExecutor.invoke({
    input,
  });

  console.log(result);

  expect(result.input).toBe(input);
  expect(typeof result.output).toBe("string");
  // Length greater than 10 because any less than that would warrant
  // an investigation into why such a short generation was returned.
  expect(result.output.length).toBeGreaterThan(10);
});

test.skip("createOpenAIToolsAgent tracing works when it is nested in a lambda", async () => {
  AsyncLocalStorageProviderSingleton.initializeGlobalInstance(
    new AsyncLocalStorage()
  );
  const prompt = await pull<ChatPromptTemplate>("hwchase17/openai-tools-agent");
  const llm = new ChatOpenAI({
    modelName: "gpt-3.5-turbo-1106",
    temperature: 0,
  });
  const agent = await createOpenAIToolsAgent({
    llm,
    tools,
    prompt,
  });
  const agentExecutor = new AgentExecutor({
    agent,
    tools,
  });

  const outer = RunnableLambda.from(async (input) => {
    const noop = RunnableLambda.from(() => "hi").withConfig({
      runName: "nested_testing",
    });
    const noopRes = await noop.invoke({ nested: "nested" });
    console.log(noopRes);
    const res = await agentExecutor.invoke({
      input,
    });
    return res;
  });
  const input = "what is LangChain?";
  const result = await outer.invoke(input, {
    tags: ["test"],
    callbacks: [new LangChainTracer({ projectName: "langchainjs-tracing-2" })],
  });

  console.log(result);

  expect(result.input).toBe(input);
  expect(typeof result.output).toBe("string");
  // Length greater than 10 because any less than that would warrant
  // an investigation into why such a short generation was returned.
  expect(result.output.length).toBeGreaterThan(10);
});
