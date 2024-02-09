import { test, expect } from "@jest/globals";
import { getEnvironmentVariable } from "@langchain/core/utils/env";
import { ClientSecretCredential, TokenCredential } from "@azure/identity";
import { AzureOpenAIEmbeddings } from "../embeddings.js";

test("Test OpenAIEmbeddings.embedQuery", async () => {
  const embeddings = new AzureOpenAIEmbeddings();
  const res = await embeddings.embedQuery("Hello world");
  expect(typeof res[0]).toBe("number");
});

test("Test OpenAIEmbeddings.embedDocuments", async () => {
  const embeddings = new AzureOpenAIEmbeddings();
  const res = await embeddings.embedDocuments(["Hello world", "Bye bye"]);
  expect(res).toHaveLength(2);
  expect(typeof res[0][0]).toBe("number");
  expect(typeof res[1][0]).toBe("number");
});

test("Test OpenAIEmbeddings concurrency", async () => {
  const embeddings = new AzureOpenAIEmbeddings({
    batchSize: 1,
    maxConcurrency: 2,
  });
  const res = await embeddings.embedDocuments([
    "Hello world",
    "Bye bye",
    "Hello world",
    "Bye bye",
    "Hello world",
    "Bye bye",
  ]);
  expect(res).toHaveLength(6);
  expect(res.find((embedding) => typeof embedding[0] !== "number")).toBe(
    undefined
  );
});

test("Test timeout error thrown from SDK", async () => {
  await expect(async () => {
    const model = new AzureOpenAIEmbeddings({
      timeout: 1,
    });
    await model.embedDocuments([
      "Hello world",
      "Bye bye",
      "Hello world",
      "Bye bye",
      "Hello world",
      "Bye bye",
    ]);
  }).rejects.toThrow();
});

test("Test OpenAIEmbeddings.embedQuery with TokenCredentials", async () => {
  const tenantId: string = getEnvironmentVariable("AZURE_TENANT_ID") ?? "";
  const clientId: string = getEnvironmentVariable("AZURE_CLIENT_ID") ?? "";
  const clientSecret: string =
    getEnvironmentVariable("AZURE_CLIENT_SECRET") ?? "";

  const credentials: TokenCredential = new ClientSecretCredential(
    tenantId,
    clientId,
    clientSecret
  );

  const embeddings = new AzureOpenAIEmbeddings({ credentials });
  const res = await embeddings.embedQuery("Hello world");
  expect(typeof res[0]).toBe("number");
});
