import type { Client, ResultSet, Value, LibsqlError } from "@libsql/client";
import { VectorStore } from "@langchain/core/vectorstores";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { Document } from "@langchain/core/documents";

interface Result {
  content: string;
  metadata: string;
  distance: number;
}

/**
 * Interface for LibSQLVectorStore configuration options.
 */
export interface LibSQLVectorStoreArgs {
  /** Name of the table to store vectors. Defaults to "vectors". */
  table?: string;
  /** Name of the column to store embeddings. Defaults to "embedding". */
  column?: string;
  // TODO: Support adding additional columns to the table for metadata.
}

/**
 * A vector store using LibSQL/Turso for storage and retrieval.
 */
export class LibSQLVectorStore extends VectorStore {
  declare FilterType: (doc: Document) => boolean;

  private db;

  private readonly table: string;

  private readonly column: string;

  /**
   * Returns the type of vector store.
   * @returns {string} The string "libsql".
   */
  _vectorstoreType(): string {
    return "libsql";
  }

  /**
   * Initializes a new instance of the LibSQLVectorStore.
   * @param {EmbeddingsInterface} embeddings - The embeddings interface to use.
   * @param {Client} db - The LibSQL client instance.
   * @param {LibSQLVectorStoreArgs} options - Configuration options for the vector store.
   */
  constructor(
    db: Client,
    embeddings: EmbeddingsInterface,
    options: LibSQLVectorStoreArgs = {
      table: "vectors",
      column: "embedding",
    }
  ) {
    super(embeddings, options);

    this.db = db;
    this.table = options.table || "vectors";
    this.column = options.column || "embedding";
  }

  /**
   * Adds documents to the vector store.
   * @param {Document[]} documents - The documents to add.
   * @returns {Promise<string[]>} The IDs of the added documents.
   */
  async addDocuments(documents: Document[]): Promise<string[]> {
    const texts = documents.map(({ pageContent }) => pageContent);
    const embeddings = await this.embeddings.embedDocuments(texts);

    return this.addVectors(embeddings, documents);
  }

  /**
   * Adds vectors to the vector store.
   * @param {number[][]} vectors - The vectors to add.
   * @param {Document[]} documents - The documents associated with the vectors.
   * @returns {Promise<string[]>} The IDs of the added vectors.
   */
  async addVectors(
    vectors: number[][],
    documents: Document[]
  ): Promise<string[]> {
    const rows = vectors.map((embedding, idx) => ({
      content: documents[idx].pageContent,
      embedding: `[${embedding.join(",")}]`,
      metadata: JSON.stringify(documents[idx].metadata),
    }));

    const batchSize = 100;
    const ids: string[] = [];

    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize);
      const insertQueries = chunk.map(
        (row) =>
          `INSERT INTO ${this.table} (content, metadata, ${this.column}) VALUES (${row.content}, ${row.metadata}, vector(${row.embedding})) RETURNING id`
      );

      const results = await this.db.batch(insertQueries);

      for (const result of results) {
        if (
          result &&
          result.rows &&
          result.rows.length > 0 &&
          result.rows[0].id != null
        ) {
          ids.push(result.rows[0].id.toString());
        }
      }
    }

    return ids;
  }

  /**
   * Performs a similarity search using a vector query and returns documents with their scores.
   * @param {number[]} query - The query vector.
   * @param {number} k - The number of results to return.
   * @returns {Promise<[Document, number][]>} An array of tuples containing the similar documents and their scores.
   */
  async similaritySearchVectorWithScore(
    query: number[],
    k: number
    // filter is currently unused
    // filter?: this["FilterType"]
  ): Promise<[Document, number][]> {
    const queryVector = `[${query.join(",")}]`;

    const sql = `
      SELECT content, metadata, vector_distance_cos(${this.column}, vector(${queryVector})) AS distance
      FROM vector_top_k('${this.table}_idx', vector(${queryVector}), ${k})
      JOIN ${this.table} ON ${this.table}.rowid = id
    `;

    const results = await this.db.execute(
      sql

    );

    return results.rows.map((row: any) => {
      const metadata = JSON.parse(row.metadata);

      const doc = new Document({
        metadata,
        pageContent: row.content,
      });

      return [doc, row.distance];
    });
  }

  /**
   * Deletes vectors from the store.
   * @param {Object} params - Delete parameters.
   * @param {string[] | number[]} [params.ids] - The ids of the vectors to delete.
   * @returns {Promise<void>}
   */
  async delete(params: { ids?: string[] | number[] }): Promise<void> {
    if (!params.ids) {
      await this.db.execute(`DELETE FROM ${this.table}`);
      return;
    }

    const idsToDelete = params.ids.join(", ");

    await this.db.execute({
      sql: `DELETE FROM ${this.table} WHERE id IN (?)`,
      args: [idsToDelete],
    });
  }

  /**
   * Creates a new LibSQLVectorStore instance from texts.
   * @param {string[]} texts - The texts to add to the store.
   * @param {object[] | object} metadatas - The metadata for the texts.
   * @param {EmbeddingsInterface} embeddings - The embeddings interface to use.
   * @param {Client} dbClient - The LibSQL client instance.
   * @param {LibSQLVectorStoreArgs} [options] - Configuration options for the vector store.
   * @returns {Promise<LibSQLVectorStore>} A new LibSQLVectorStore instance.
   */
  static async fromTexts(
    texts: string[],
    metadatas: object[] | object,
    embeddings: EmbeddingsInterface,
    dbClient: Client,
    options?: LibSQLVectorStoreArgs
  ): Promise<LibSQLVectorStore> {
    const docs = texts.map((text, i) => {
      const metadata = Array.isArray(metadatas) ? metadatas[i] : metadatas;

      return new Document({ pageContent: text, metadata });
    });

    return LibSQLVectorStore.fromDocuments(docs, embeddings, dbClient, options);
  }

  /**
   * Creates a new LibSQLVectorStore instance from documents.
   * @param {Document[]} docs - The documents to add to the store.
   * @param {EmbeddingsInterface} embeddings - The embeddings interface to use.
   * @param {Client} dbClient - The LibSQL client instance.
   * @param {LibSQLVectorStoreArgs} [options] - Configuration options for the vector store.
   * @returns {Promise<LibSQLVectorStore>} A new LibSQLVectorStore instance.
   */
  static async fromDocuments(
    docs: Document[],
    embeddings: EmbeddingsInterface,
    dbClient: Client,
    options?: LibSQLVectorStoreArgs
  ): Promise<LibSQLVectorStore> {
    const instance = new this(embeddings, dbClient, options);

    await instance.addDocuments(docs);

    return instance;
  }
}
