import { GoogleAuth, GoogleAuthOptions } from "google-auth-library";
import { Embeddings, EmbeddingsParams } from "@langchain/core/embeddings";
import { AsyncCallerCallOptions } from "@langchain/core/utils/async_caller";
import { chunkArray } from "@langchain/core/utils/chunk_array";
import {
  GoogleVertexAIBasePrediction,
  GoogleVertexAIBaseLLMInput,
  GoogleVertexAILLMPredictions,
} from "../types/googlevertexai-types.js";
import { GoogleVertexAILLMConnection } from "../utils/googlevertexai-connection.js";

/**
 * Defines the parameters required to initialize a
 * GoogleVertexAIEmbeddings instance. It extends EmbeddingsParams and
 * GoogleVertexAIConnectionParams.
 */
export interface GoogleVertexAIEmbeddingsParams
  extends EmbeddingsParams,
    GoogleVertexAIBaseLLMInput<GoogleAuthOptions> {}

/**
 * Defines additional options specific to the
 * GoogleVertexAILLMEmbeddingsInstance. It extends AsyncCallerCallOptions.
 */
interface GoogleVertexAILLMEmbeddingsOptions extends AsyncCallerCallOptions {}

/**
 * Represents an instance for generating embeddings using the Google
 * Vertex AI API. It contains the content to be embedded.
 */
interface GoogleVertexAILLMEmbeddingsInstance {
  content: string;
}

/**
 * Defines the structure of the embeddings results returned by the Google
 * Vertex AI API. It extends GoogleVertexAIBasePrediction and contains the
 * embeddings and their statistics.
 */
interface GoogleVertexEmbeddingsResults extends GoogleVertexAIBasePrediction {
  embeddings: {
    statistics: {
      token_count: number;
      truncated: boolean;
    };
    values: number[];
  };
}

/**
 * Enables calls to the Google Cloud's Vertex AI API to access
 * the embeddings generated by Large Language Models.
 *
 * To use, you will need to have one of the following authentication
 * methods in place:
 * - You are logged into an account permitted to the Google Cloud project
 *   using Vertex AI.
 * - You are running this on a machine using a service account permitted to
 *   the Google Cloud project using Vertex AI.
 * - The `GOOGLE_APPLICATION_CREDENTIALS` environment variable is set to the
 *   path of a credentials file for a service account permitted to the
 *   Google Cloud project using Vertex AI.
 * @example
 * ```typescript
 * const model = new GoogleVertexAIEmbeddings();
 * const res = await model.embedQuery(
 *   "What would be a good company name for a company that makes colorful socks?"
 * );
 * console.log({ res });
 * ```
 */
export class GoogleVertexAIEmbeddings
  extends Embeddings
  implements GoogleVertexAIEmbeddingsParams
{
  model = "textembedding-gecko";

  private connection: GoogleVertexAILLMConnection<
    GoogleVertexAILLMEmbeddingsOptions,
    GoogleVertexAILLMEmbeddingsInstance,
    GoogleVertexEmbeddingsResults,
    GoogleAuthOptions
  >;

  constructor(fields?: GoogleVertexAIEmbeddingsParams) {
    super(fields ?? {});

    this.model = fields?.model ?? this.model;

    this.connection = new GoogleVertexAILLMConnection(
      { ...fields, ...this },
      this.caller,
      new GoogleAuth({
        scopes: "https://www.googleapis.com/auth/cloud-platform",
        ...fields?.authOptions,
      })
    );
  }

  /**
   * Takes an array of documents as input and returns a promise that
   * resolves to a 2D array of embeddings for each document. It splits the
   * documents into chunks and makes requests to the Google Vertex AI API to
   * generate embeddings.
   * @param documents An array of documents to be embedded.
   * @returns A promise that resolves to a 2D array of embeddings for each document.
   */
  async embedDocuments(documents: string[]): Promise<number[][]> {
    const instanceChunks: GoogleVertexAILLMEmbeddingsInstance[][] = chunkArray(
      documents.map((document) => ({
        content: document,
      })),
      5
    ); // Vertex AI accepts max 5 instances per prediction
    const parameters = {};
    const options = {};
    const responses = await Promise.all(
      instanceChunks.map((instances) =>
        this.connection.request(instances, parameters, options)
      )
    );
    const result: number[][] =
      responses
        ?.map(
          (response) =>
            (
              response?.data as GoogleVertexAILLMPredictions<GoogleVertexEmbeddingsResults>
            )?.predictions?.map((result) => result.embeddings.values) ?? []
        )
        .flat() ?? [];
    return result;
  }

  /**
   * Takes a document as input and returns a promise that resolves to an
   * embedding for the document. It calls the embedDocuments method with the
   * document as the input.
   * @param document A document to be embedded.
   * @returns A promise that resolves to an embedding for the document.
   */
  async embedQuery(document: string): Promise<number[]> {
    const data = await this.embedDocuments([document]);
    return data[0];
  }
}
