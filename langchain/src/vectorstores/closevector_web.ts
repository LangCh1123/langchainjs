import {
  CloseVectorHNSWWeb,
  HierarchicalNSWT,
  CloseVectorHNSWLibArgs,
  CloseVectorDocument,
  CloseVectorCredentials,
  HnswlibModule,
} from "closevector-web";

import { Embeddings } from "../embeddings/base.js";
import { Document } from "../document.js";
import { SaveableVectorStore } from "./base.js";

/**
 * package closevector-node is largely based on hnswlib.ts in the current folder with the following exceptions:
 * 1. It uses a modified version of hnswlib-node to ensure the generated index can be loaded by closevector_web.ts.
 * 2. It adds features to upload and download the index to/from the CDN provided by CloseVector.
 *
 * For more information, check out https://closevector-docs.getmegaportal.com/
 */

/**
 * Arguments for creating a CloseVectorWeb instance, extending CloseVectorHNSWLibArgs.
 */
export interface CloseVectorWebArgs
  extends CloseVectorHNSWLibArgs<HierarchicalNSWT> {
  instance?: CloseVectorHNSWWeb;
}

/**
 * Class that implements a vector store using CloseVector, It extends the SaveableVectorStore class and
 * provides methods for adding documents and vectors, performing
 * similarity searches, and saving and loading the vector store.
 */
export class CloseVectorWeb extends SaveableVectorStore {
  declare FilterType: (doc: Document) => boolean;

  _instance?: CloseVectorHNSWWeb;

  // credentials will not be saved to disk
  credentials?: CloseVectorCredentials;

  _vectorstoreType(): string {
    return "closevector";
  }

  constructor(
    embeddings: Embeddings,
    args: CloseVectorWebArgs,
    credentials?: CloseVectorCredentials
  ) {
    super(embeddings, args);
    if (args.instance) {
      this.instance = args.instance;
    } else {
      this.instance = new CloseVectorHNSWWeb(embeddings, args);
    }
    this.credentials = credentials;
  }

  public get instance(): CloseVectorHNSWWeb {
    if (!this._instance) {
      throw new Error(
        "Vector store not initialised yet. Try calling `addTexts` first."
      );
    }
    return this._instance;
  }

  private set instance(instance: CloseVectorHNSWWeb) {
    this._instance = instance;
  }

  /**
   * Method to add documents to the vector store. It first converts the
   * documents to vectors using the embeddings, then adds the vectors to the
   * vector store.
   * @param documents The documents to be added to the vector store.
   * @returns A Promise that resolves when the documents have been added.
   */
  async addDocuments(documents: Document[]): Promise<void> {
    await this.instance.addDocuments(documents);
  }

  /**
   * Method to save the vector store to a directory. It saves the HNSW
   * index, the arguments, and the document store to the directory.
   * @param directory The directory to which to save the vector store.
   * @returns A Promise that resolves when the vector store has been saved.
   */
  async save(directory: string): Promise<void> {
    await this.instance.save(directory);
  }

  /**
   * Static method to load a vector store from a directory. It reads the
   * HNSW index, the arguments, and the document store from the directory,
   * then creates a new CloseVectorWeb instance with these values.
   * @param directory The directory from which to load the vector store.
   * @param embeddings The embeddings to be used by the CloseVectorWeb instance.
   * @returns A Promise that resolves to a new CloseVectorWeb instance.
   */
  static async load(
    directory: string,
    embeddings: Embeddings,
    credentials?: CloseVectorCredentials
  ) {
    const instance = await CloseVectorHNSWWeb.load(directory, embeddings);
    const vectorstore = new this(embeddings, instance.args, credentials);
    return vectorstore;
  }

  /**
   * Method to add vectors to the vector store. It first initializes the
   * index if it hasn't been initialized yet, then adds the vectors to the
   * index and the documents to the document store.
   * @param vectors The vectors to be added to the vector store.
   * @param documents The documents corresponding to the vectors.
   * @returns A Promise that resolves when the vectors and documents have been added.
   */
  async addVectors(vectors: number[][], documents: Document[]) {
    await this.instance.addVectors(vectors, documents);
  }

  /**
   * Method to perform a similarity search in the vector store using a query
   * vector. It returns the k most similar documents along with their
   * similarity scores. An optional filter function can be provided to
   * filter the documents.
   * @param query The query vector.
   * @param k The number of most similar documents to return.
   * @param filter An optional filter function to filter the documents.
   * @returns A Promise that resolves to an array of tuples, where each tuple contains a document and its similarity score.
   */
  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: this["FilterType"]
  ) {
    const resp = await this.instance.similaritySearchVectorWithScore(
      query,
      k,
      filter
        ? (x: CloseVectorDocument<Record<string, any>>) =>
            filter?.({
              pageContent: x.pageContent,
              metadata: x.metadata || {},
            }) || false
        : undefined
    );
    const mapped = resp.map((x: any) => [
      {
        pageContent: x[0].pageContent,
        metadata: x[0].metadata || {},
      },
      x[1],
    ]) as [Document<Record<string, any>>, number][];
    return mapped;
  }

  /**
   * Method to delete the vector store from a directory. It deletes the
   * hnswlib.index file, the docstore.json file, and the args.json file from
   * the directory.
   * @param params An object with a directory property that specifies the directory from which to delete the vector store.
   * @returns A Promise that resolves when the vector store has been deleted.
   */
  async delete(params: { directory: string }) {
    return await this.instance.delete(params);
  }

  /**
   * Static method to create a new CloseVectorWeb instance from texts and metadata.
   * It creates a new Document instance for each text and metadata, then
   * calls the fromDocuments method to create the CloseVectorWeb instance.
   * @param texts The texts to be used to create the documents.
   * @param metadatas The metadata to be used to create the documents.
   * @param embeddings The embeddings to be used by the CloseVectorWeb instance.
   * @param args An optional configuration object for the CloseVectorWeb instance.
   * @param credential An optional credential object for the CloseVector API.
   * @returns A Promise that resolves to a new CloseVectorWeb instance.
   */
  static async fromTexts(
    texts: string[],
    metadatas: object[] | object,
    embeddings: Embeddings,
    args?: Record<string, any>,
    credential?: CloseVectorCredentials
  ): Promise<CloseVectorWeb> {
    const docs: Document[] = [];
    for (let i = 0; i < texts.length; i += 1) {
      const metadata = Array.isArray(metadatas) ? metadatas[i] : metadatas;
      const newDoc = new Document({
        pageContent: texts[i],
        metadata,
      });
      docs.push(newDoc);
    }
    return await CloseVectorWeb.fromDocuments(
      docs,
      embeddings,
      args as CloseVectorWebArgs,
      credential
    );
  }

  /**
   * Static method to create a new CloseVectorWeb instance from documents. It
   * creates a new CloseVectorWeb instance, adds the documents to it, then returns
   * the instance.
   * @param docs The documents to be added to the CloseVectorWeb instance.
   * @param embeddings The embeddings to be used by the CloseVectorWeb instance.
   * @param args An optional configuration object for the CloseVectorWeb instance.
   * @param credentials An optional credential object for the CloseVector API.
   * @returns A Promise that resolves to a new CloseVectorWeb instance.
   */
  static async fromDocuments(
    docs: Document[],
    embeddings: Embeddings,
    args?: Record<string, any>,
    credentials?: CloseVectorCredentials
  ): Promise<CloseVectorWeb> {
    const _args: Record<string, any> = args || {
      space: "cosine",
    };
    const instance = new this(
      embeddings,
      _args as CloseVectorWebArgs,
      credentials
    );
    await instance.addDocuments(docs);
    return instance;
  }

  static async imports(): Promise<HnswlibModule> {
    return await CloseVectorHNSWWeb.imports();
  }
}
