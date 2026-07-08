import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { loadEnv } from "@mewmo/shared";
import { createHmac } from "node:crypto";

import { createStorageClient } from "./client";

interface StorageClient {
  send(command: { input: unknown }): Promise<unknown>;
}

interface StorageEnv {
  R2_BUCKET?: string | undefined;
  R2_PUBLIC_BASE_URL?: string | undefined;
  R2_ENDPOINT?: string | undefined;
  R2_ACCESS_KEY?: string | undefined;
  R2_SECRET_KEY?: string | undefined;
  STORAGE_PROVIDER?: "r2" | "qiniu" | undefined;
  QINIU_ACCESS_KEY?: string | undefined;
  QINIU_SECRET_KEY?: string | undefined;
  QINIU_BUCKET?: string | undefined;
  QINIU_PUBLIC_BASE_URL?: string | undefined;
  QINIU_UPLOAD_ENDPOINT?: string | undefined;
}

interface StorageServiceOptions {
  fetch?: typeof fetch;
}

const QINIU_UPLOAD_ENDPOINTS = [
  "https://upload-z2.qiniup.com",
  "https://upload.qiniup.com",
  "https://upload-z0.qiniup.com",
  "https://upload-z1.qiniup.com",
  "https://upload-na0.qiniup.com",
  "https://upload-as0.qiniup.com",
];

function cleanPath(path: string): string {
  return path.replace(/^\/+/, "");
}

function publicUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${cleanPath(path)}`;
}

function urlSafeBase64(value: string | Buffer): string {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

function createQiniuUploadToken({
  accessKey,
  secretKey,
  bucket,
  key,
}: {
  accessKey: string;
  secretKey: string;
  bucket: string;
  key: string;
}) {
  const putPolicy = {
    scope: `${bucket}:${key}`,
    deadline: Math.floor(Date.now() / 1000) + 3600,
    returnBody: '{"key":"$(key)","hash":"$(etag)","bucket":"$(bucket)"}',
  };
  const encodedPolicy = urlSafeBase64(JSON.stringify(putPolicy));
  const signature = createHmac("sha1", secretKey).update(encodedPolicy).digest("base64");

  return `${accessKey}:${signature.replace(/\+/g, "-").replace(/\//g, "_")}:${encodedPolicy}`;
}

function qiniuConfig(env: StorageEnv) {
  if (!env.QINIU_ACCESS_KEY || !env.QINIU_SECRET_KEY || !env.QINIU_BUCKET || !env.QINIU_PUBLIC_BASE_URL) {
    throw new Error("Invalid Qiniu storage configuration");
  }

  return {
    accessKey: env.QINIU_ACCESS_KEY,
    secretKey: env.QINIU_SECRET_KEY,
    bucket: env.QINIU_BUCKET,
    publicBaseUrl: env.QINIU_PUBLIC_BASE_URL,
    uploadEndpoints: [
      env.QINIU_UPLOAD_ENDPOINT,
      ...QINIU_UPLOAD_ENDPOINTS,
    ].filter((endpoint, index, endpoints): endpoint is string => Boolean(endpoint) && endpoints.indexOf(endpoint) === index),
  };
}

function r2Config(env: StorageEnv) {
  if (!env.R2_BUCKET || !env.R2_PUBLIC_BASE_URL) throw new Error("Invalid R2 storage configuration");

  return {
    bucket: env.R2_BUCKET,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL,
  };
}

function toBlob(file: Uint8Array | Buffer | Blob | string, contentType?: string): Blob {
  if (file instanceof Blob) return file;
  return contentType ? new Blob([file as BlobPart], { type: contentType }) : new Blob([file as BlobPart]);
}

export function createStorageService(
  client: StorageClient | undefined = undefined,
  env: StorageEnv = loadEnv(),
  options: StorageServiceOptions = {},
) {
  const fetchImpl = options.fetch ?? fetch;

  return {
    async upload(file: Uint8Array | Buffer | Blob | string, path: string, contentType?: string) {
      const key = cleanPath(path);

      if (env.STORAGE_PROVIDER === "qiniu") {
        const config = qiniuConfig(env);
        const token = createQiniuUploadToken({
          accessKey: config.accessKey,
          secretKey: config.secretKey,
          bucket: config.bucket,
          key,
        });
        const formData = new FormData();
        formData.set("token", token);
        formData.set("key", key);
        formData.set("file", toBlob(file, contentType), key.split("/").at(-1) ?? "file");

        let lastError = "";
        for (const endpoint of config.uploadEndpoints) {
          const response = await fetchImpl(endpoint, {
            method: "POST",
            body: formData,
          });
          if (response.ok) return { path: key, url: publicUrl(config.publicBaseUrl, key) };
          lastError = await response.text().catch(() => "");
        }

        throw new Error(lastError || "Qiniu upload failed");
      }

      const config = r2Config(env);
      const r2Client = client ?? createStorageClient(env);
      await r2Client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: file,
          ContentType: contentType,
        }),
      );

      return { path: key, url: this.getUrl(key) };
    },

    getUrl(path: string) {
      if (env.STORAGE_PROVIDER === "qiniu") return publicUrl(qiniuConfig(env).publicBaseUrl, path);
      return publicUrl(r2Config(env).publicBaseUrl, path);
    },

    delete(path: string) {
      if (env.STORAGE_PROVIDER === "qiniu") throw new Error("Qiniu delete is not implemented");

      const config = r2Config(env);
      const r2Client = client ?? createStorageClient(env);
      return r2Client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
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
