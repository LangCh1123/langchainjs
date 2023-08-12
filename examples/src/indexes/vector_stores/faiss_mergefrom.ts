import { FaissStore } from "langchain/vectorstores/faiss";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";

export const run = async () => {
  // Create a vector store with initial documents and embeddings
  const vectorStore = await FaissStore.fromTexts(
    ["Hello world", "Bye bye", "hello nice world"],
    [{ id: 2 }, { id: 1 }, { id: 3 }],
    new OpenAIEmbeddings()
  );

  // Create another vector store with new documents and embeddings
  const vectorStore2 = await FaissStore.fromTexts(
    ["Some text"],
    [{ id: 1 }],
    new OpenAIEmbeddings()
  );

  // merge the first vector store into vectorStore2
  await vectorStore2.mergeFrom(vectorStore);

  const resultOne = await vectorStore2.similaritySearch("hello world", 1);
  console.log(resultOne);

  // You can also create a new vector store from another FaissStore index
  const vectorStore3 = await FaissStore.fromIndex(
    vectorStore2,
    new OpenAIEmbeddings()
  );
  const resultTwo = await vectorStore3.similaritySearch("Bye bye", 1);
  console.log(resultTwo);
};
