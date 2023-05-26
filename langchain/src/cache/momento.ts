/* eslint-disable no-instanceof/no-instanceof */
import {
  ICacheClient,
  CacheGet,
  CacheSet,
  CreateCache,
  InvalidArgumentError,
} from "@gomomento/sdk";

import { BaseCache, Generation } from "../schema/index.js";
import { getCacheKey } from "./base.js";

/**
 * The settings to instantiate the Momento standard cache.
 */
export interface MomentoCacheProps {
  /**
   * The Momento cache client.
   */
  client: ICacheClient;
  /**
   * The name of the cache to use to store the data.
   */
  cacheName: string;
  /**
   * The time to live for the cache items. If not specified,
   * the cache client default is used.
   */
  ttlSeconds?: number;
  /**
   * If true, ensure that the cache exists before returning.
   * If false, the cache is not checked for existence.
   * Defaults to true.
   */
  ensureCacheExists?: true;
}

/**
 * A cache that uses Momento as the backing store.
 * See https://gomomento.com.
 */
export class MomentoCache extends BaseCache {
  private client: ICacheClient;

  private cacheName: string;

  private ttlSeconds?: number;

  private constructor(props: MomentoCacheProps) {
    super();
    this.client = props.client;
    this.cacheName = props.cacheName;

    this.validateTtlSeconds(props.ttlSeconds);
    this.ttlSeconds = props.ttlSeconds;
  }

  /**
   * Create a new standard cache backed by Momento.
   *
   * @param props The settings to instantiate the cache.
   * @param props.cacheClient The Momento cache client.
   * @param props.cacheName The name of the cache to use to store the data.
   * @param props.ttlSeconds The time to live for the cache items. If not specified,
   * the cache client default is used.
   * @param props.ensureCacheExists If true, ensure that the cache exists before returning.
   * If false, the cache is not checked for existence. Defaults to true.
   * @throws InvalidArgumentError if the TTL is not strictly positive.
   * @returns The Momento-backed cache.
   */
  public static async CreateAsync(
    props: MomentoCacheProps
  ): Promise<MomentoCache> {
    const instance = new MomentoCache(props);
    if (props.ensureCacheExists || props.ensureCacheExists === undefined) {
      await ensureCacheExists(props.client, props.cacheName);
    }
    return instance;
  }

  /**
   * Validate the user-specified TTL, if provided, is strictly positive.
   * @param ttlSeconds The TTL to validate.
   */
  private validateTtlSeconds(ttlSeconds?: number): void {
    if (ttlSeconds !== undefined && ttlSeconds <= 0) {
      throw new InvalidArgumentError("ttlSeconds must be positive.");
    }
  }

  /**
   * Lookup LLM generations in cache by prompt and associated LLM key.
   * @param prompt The prompt to lookup.
   * @param llmKey The LLM key to lookup.
   * @returns The generations associated with the prompt and LLM key, or null if not found.
   */
  public async lookup(
    prompt: string,
    llmKey: string
  ): Promise<Generation[] | null> {
    const key = getCacheKey(prompt, llmKey);
    const getResponse = await this.client.get(this.cacheName, key);

    if (getResponse instanceof CacheGet.Hit) {
      const value = getResponse.valueString();
      return JSON.parse(value);
    } else if (getResponse instanceof CacheGet.Miss) {
      return null;
    } else if (getResponse instanceof CacheGet.Error) {
      throw getResponse.innerException();
    } else {
      throw new Error(`Unknown response type: ${getResponse.toString()}`);
    }
  }

  /**
   * Update the cache with the given generations.
   *
   * Note this overwrites any existing generations for the given prompt and LLM key.
   *
   * @param prompt The prompt to update.
   * @param llmKey The LLM key to update.
   * @param value The generations to store.
   */
  public async update(
    prompt: string,
    llmKey: string,
    value: Generation[]
  ): Promise<void> {
    const key = getCacheKey(prompt, llmKey);
    const setResponse = await this.client.set(
      this.cacheName,
      key,
      JSON.stringify(value),
      { ttl: this.ttlSeconds }
    );

    if (setResponse instanceof CacheSet.Success) {
      // pass
    } else if (setResponse instanceof CacheSet.Error) {
      throw setResponse.innerException();
    } else {
      throw new Error(`Unknown response type: ${setResponse.toString()}`);
    }
  }
}

/**
 * Ensure that the cache exists.
 */
async function ensureCacheExists(
  client: ICacheClient,
  cacheName: string
): Promise<void> {
  const createResponse = await client.createCache(cacheName);
  if (
    createResponse instanceof CreateCache.Success ||
    createResponse instanceof CreateCache.AlreadyExists
  ) {
    // pass
  } else if (createResponse instanceof CreateCache.Error) {
    throw createResponse.innerException();
  } else {
    throw new Error(`Unknown response type: ${createResponse.toString()}`);
  }
}
