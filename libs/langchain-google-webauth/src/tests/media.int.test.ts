import fs from "fs/promises";
import { test } from "@jest/globals";
import { MediaBlob } from "@langchain/google-common";
import {
  BlobStoreGoogleCloudStorage,
  BlobStoreGoogleCloudStorageParams,
} from "../media.js";

describe("Google Webauth GCS store", () => {
  test("save text no-metadata", async () => {
    const uri = `gs://test-langchainjs/text/test-${Date.now()}-nm`;
    const content = "This is a test";
    const blob = new MediaBlob({
      path: uri,
      data: new Blob([content], { type: "text/plain" }),
    });
    const config: BlobStoreGoogleCloudStorageParams = {};
    const blobStore = new BlobStoreGoogleCloudStorage(config);
    const storedBlob = await blobStore.store(blob);
    // console.log(storedBlob);
    expect(storedBlob.path).toEqual(uri);
    expect(await storedBlob.asString()).toEqual(content);
    expect(storedBlob.mimetype).toEqual("text/plain");
    expect(storedBlob.metadata).not.toHaveProperty("metadata");
    expect(storedBlob.size).toEqual(content.length);
    expect(storedBlob.metadata?.kind).toEqual("storage#object");
  });

  test("save text with-metadata", async () => {
    const uri = `gs://test-langchainjs/text/test-${Date.now()}-wm`;
    const content = "This is a test";
    const blob = new MediaBlob({
      path: uri,
      data: new Blob([content], { type: "text/plain" }),
      metadata: {
        alpha: "one",
        bravo: "two",
      },
    });
    const config: BlobStoreGoogleCloudStorageParams = {};
    const blobStore = new BlobStoreGoogleCloudStorage(config);
    const storedBlob = await blobStore.store(blob);
    // console.log(storedBlob);
    expect(storedBlob.path).toEqual(uri);
    expect(await storedBlob.asString()).toEqual(content);
    expect(storedBlob.mimetype).toEqual("text/plain");
    expect(storedBlob.metadata).toHaveProperty("metadata");
    expect(storedBlob.metadata?.metadata?.alpha).toEqual("one");
    expect(storedBlob.metadata?.metadata?.bravo).toEqual("two");
    expect(storedBlob.size).toEqual(content.length);
    expect(storedBlob.metadata?.kind).toEqual("storage#object");
  });

  test("save image no-metadata", async () => {
    const filename = `src/tests/data/blue-square.png`;
    const dataBuffer = await fs.readFile(filename);
    const data = new Blob([dataBuffer], { type: "image/png" });

    const uri = `gs://test-langchainjs/image/test-${Date.now()}-nm`;
    const blob = new MediaBlob({
      path: uri,
      data,
    });
    const config: BlobStoreGoogleCloudStorageParams = {};
    const blobStore = new BlobStoreGoogleCloudStorage(config);
    const storedBlob = await blobStore.store(blob);
    // console.log(storedBlob);
    expect(storedBlob.path).toEqual(uri);
    expect(storedBlob.size).toEqual(176);
    expect(storedBlob.mimetype).toEqual("image/png");
    expect(storedBlob.metadata?.kind).toEqual("storage#object");
  });

  test("get text no-metadata", async () => {
    const uri: string = "gs://test-langchainjs/text/test-nm";
    const config: BlobStoreGoogleCloudStorageParams = {};
    const blobStore = new BlobStoreGoogleCloudStorage(config);
    const blob = await blobStore.fetch(uri);
    // console.log(blob);
    expect(blob?.path).toEqual(uri);
    expect(await blob?.asString()).toEqual("This is a test");
    expect(blob?.mimetype).toEqual("text/plain");
    expect(blob?.metadata).not.toHaveProperty("metadata");
    expect(blob?.size).toEqual(14);
    expect(blob?.metadata?.kind).toEqual("storage#object");
  });

  test("get text with-metadata", async () => {
    const uri: string = "gs://test-langchainjs/text/test-wm";
    const config: BlobStoreGoogleCloudStorageParams = {};
    const blobStore = new BlobStoreGoogleCloudStorage(config);
    const blob = await blobStore.fetch(uri);
    // console.log(blob);
    expect(blob?.path).toEqual(uri);
    expect(await blob?.asString()).toEqual("This is a test");
    expect(blob?.mimetype).toEqual("text/plain");
    expect(blob?.metadata).toHaveProperty("metadata");
    expect(blob?.metadata?.metadata?.alpha).toEqual("one");
    expect(blob?.metadata?.metadata?.bravo).toEqual("two");
    expect(blob?.size).toEqual(14);
    expect(blob?.metadata?.kind).toEqual("storage#object");
  });

  test("get image no-metadata", async () => {
    const uri: string = "gs://test-langchainjs/image/test-nm";
    const config: BlobStoreGoogleCloudStorageParams = {};
    const blobStore = new BlobStoreGoogleCloudStorage(config);
    const blob = await blobStore.fetch(uri);
    // console.log(storedBlob);
    expect(blob?.path).toEqual(uri);
    expect(blob?.size).toEqual(176);
    expect(blob?.mimetype).toEqual("image/png");
    expect(blob?.metadata?.kind).toEqual("storage#object");
  });
});
