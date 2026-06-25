import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { loadEnv } from "@mewmo/shared";

import { createStorageClient } from "./client";

interface StorageClient {
  send(command: { input: unknown }): Promise<unknown>;
}

interface StorageEnv {
  R2_BUCKET: string;
  R2_PUBLIC_BASE_URL: string;
}

function cleanPath(path: string): string {
  return path.replace(/^\/+/, "");
}

export function createStorageService(client: StorageClient = createStorageClient(), env: StorageEnv = loadEnv()) {
  return {
    async upload(file: Uint8Array | Buffer | Blob | string, path: string, contentType?: string) {
      const key = cleanPath(path);

      await client.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: key,
          Body: file,
          ContentType: contentType,
        }),
      );

      return { path: key, url: this.getUrl(key) };
    },

    getUrl(path: string) {
      return `${env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${cleanPath(path)}`;
    },

    delete(path: string) {
      return client.send(
        new DeleteObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: cleanPath(path),
        }),
      );
    },
  };
}

export const upload = (file: Uint8Array | Buffer | Blob | string, path: string, contentType?: string) =>
  createStorageService().upload(file, path, contentType);

export const getUrl = (path: string) => createStorageService().getUrl(path);

export const deleteObject = (path: string) => createStorageService().delete(path);
