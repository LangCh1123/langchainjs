import { test, expect } from "@jest/globals";
import { PromptLayerAzureOpenAI } from "../azure_openai.js";
import { PromptLayerAzureOpenAIChat } from "../azure_openai-chat.js";

import { PromptLayerChatOpenAI } from "../../chat_models/openai.js";
import { SystemMessage } from "../../schema/index.js";

test("Test PromptLayerAzureOpenAI returns promptLayerID if returnPromptLayerId=true", async () => {
  const model = new PromptLayerAzureOpenAI({
    maxTokens: 5,
    modelName: "text-ada-001",
    returnPromptLayerId: true,
  });
  const res = await model.generate(["Print hello world"]);
  console.log(JSON.stringify({ res }, null, 2));

  expect(
    typeof res.generations[0][0].generationInfo?.promptLayerRequestId
  ).toBe("number");

  const modelB = new PromptLayerAzureOpenAI({
    maxTokens: 5,
    modelName: "text-ada-001",
  });
  const resB = await modelB.generate(["Print hello world"]);

  expect(
    resB.generations[0][0].generationInfo?.promptLayerRequestId
  ).toBeUndefined();
});

test("Test PromptLayerOpenAIChat returns promptLayerID if returnPromptLayerId=true", async () => {
  const model = new PromptLayerAzureOpenAIChat({
    prefixMessages: [
      {
        role: "system",
        content: "You are a helpful assistant that answers in pirate language",
      },
    ],
    maxTokens: 5,
    returnPromptLayerId: true,
  });
  const res = await model.generate(["Print hello world"]);

  expect(
    typeof res.generations[0][0].generationInfo?.promptLayerRequestId
  ).toBe("number");

  const modelB = new PromptLayerAzureOpenAIChat({
    prefixMessages: [
      {
        role: "system",
        content: "You are a helpful assistant that answers in pirate language",
      },
    ],
    maxTokens: 5,
  });
  const resB = await modelB.generate(["Print hello world"]);

  expect(
    resB.generations[0][0].generationInfo?.promptLayerRequestId
  ).toBeUndefined();
});

test("Test PromptLayerChatOpenAI returns promptLayerID if returnPromptLayerId=true", async () => {
  const chat = new PromptLayerChatOpenAI({
    returnPromptLayerId: true,
  });

  const respA = await chat.generate([
    [
      new SystemMessage(
        "You are a helpful assistant that translates English to French."
      ),
    ],
  ]);

  expect(
    typeof respA.generations[0][0].generationInfo?.promptLayerRequestId
  ).toBe("number");

  const chatB = new PromptLayerChatOpenAI();

  const respB = await chatB.generate([
    [
      new SystemMessage(
        "You are a helpful assistant that translates English to French."
      ),
    ],
  ]);

  expect(
    respB.generations[0][0].generationInfo?.promptLayerRequestId
  ).toBeUndefined();
});
