import assert from "assert";
import { OpenAI } from "@langchain/openai";
import { LLMChain } from "langchain/chains";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/hf_transformers";
import { Document } from "@langchain/core/documents";
import { CallbackManager } from "@langchain/core/callbacks/manager";

// Test exports
assert(typeof OpenAI === "function");
assert(typeof LLMChain === "function");
assert(typeof ChatPromptTemplate === "function");
assert(typeof MemoryVectorStore === "function");
assert(typeof HuggingFaceTransformersEmbeddings === "function");
assert(typeof CallbackManager === "function");

const vs = new MemoryVectorStore(new HuggingFaceTransformersEmbeddings({ model: "Xenova/all-MiniLM-L6-v2", }));

await vs.addVectors(
  [
    [0, 1, 0],
    [0, 0, 1],
  ],
  [
    new Document({
      pageContent: "a",
    }),
    new Document({
      pageContent: "b",
    }),
  ]
);

assert((await vs.similaritySearchVectorWithScore([0, 0, 1], 1)).length === 1);
