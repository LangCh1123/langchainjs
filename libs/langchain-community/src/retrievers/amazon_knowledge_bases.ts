import {
  RetrieveCommand,
  BedrockAgentRuntimeClient,
  BedrockAgentRuntimeClientConfig,
} from "@aws-sdk/client-bedrock-agent-runtime";

import { BaseRetriever } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";

/**
 * Interface for the arguments required to initialize an
 * AmazonKnowledgeBaseRetriever instance.
 */
export interface AmazonKnowledgeBaseRetrieverArgs {
  knowledgeBaseId: string;
  topK: number;
  region: string;
  clientOptions?: BedrockAgentRuntimeClientConfig;
}

/**
 * Class for interacting with Amazon Bedrock Knowledge Bases, a RAG workflow oriented service
 * provided by AWS. Extends the BaseRetriever class.
 * @example
 * ```typescript
 * const retriever = new AmazonKnowledgeBaseRetriever({
 *   topK: 10,
 *   knowledgeBaseId: "YOUR_KNOWLEDGE_BASE_ID",
 *   region: "us-east-2",
 *   clientOptions: {
 *     credentials: {
 *       accessKeyId: "YOUR_ACCESS_KEY_ID",
 *       secretAccessKey: "YOUR_SECRET_ACCESS_KEY",
 *     },
 *   },
 * });
 *
 * const docs = await retriever.getRelevantDocuments("How are clouds formed?");
 * ```
 */
export class AmazonKnowledgeBaseRetriever extends BaseRetriever {
  static lc_name() {
    return "AmazonKnowledgeBaseRetriever";
  }

  lc_namespace = ["langchain", "retrievers", "amazon_bedrock_knowledge_bases"];

  knowledgeBaseId: string;

  topK: number;

  bedrockAgentRuntimeClient: BedrockAgentRuntimeClient;

  constructor({
    knowledgeBaseId,
    topK = 10,
    clientOptions,
    region,
  }: AmazonKnowledgeBaseRetrieverArgs) {
    super();

    if (!region) {
      throw new Error("Please pass region field to the constructor!");
    }

    if (!knowledgeBaseId) {
      throw new Error("Please pass Knowledge Base Id to the constructor");
    }

    this.topK = topK;
    this.bedrockAgentRuntimeClient = new BedrockAgentRuntimeClient({
      region,
      ...clientOptions,
    });

    this.knowledgeBaseId = knowledgeBaseId;
  }

  // A method to clean the result text by replacing sequences of whitespace with a single space and removing ellipses.
  /**
   * Cleans the result text by replacing sequences of whitespace with a
   * single space and removing ellipses.
   * @param resText The result text to clean.
   * @returns The cleaned result text.
   */
  cleanResult(resText: string) {
    const res = resText.replace(/\s+/g, " ").replace(/\.\.\./g, "");
    return res;
  }

  async queryKnowledgeBase(query: string, topK: number) {
    const retrieveCommand = new RetrieveCommand({
      knowledgeBaseId: this.knowledgeBaseId,
      retrievalQuery: {
        text: query,
      },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults: topK,
        },
      },
    });

    const retrieveResponse = await this.bedrockAgentRuntimeClient.send(
      retrieveCommand
    );

    return (
      retrieveResponse.retrievalResults?.map((result) => ({
        pageContent: this.cleanResult(result.content?.text || ""),
        metadata: {
          source: result.location?.s3Location?.uri,
          score: result.score,
        },
      })) ?? ([] as Array<Document>)
    );
  }

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    const docs = await this.queryKnowledgeBase(query, this.topK);
    return docs;
  }
}
