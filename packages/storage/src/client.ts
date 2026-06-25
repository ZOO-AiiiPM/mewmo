import { S3Client } from "@aws-sdk/client-s3";
import { loadEnv } from "@mewmo/shared";

export function createStorageClient(env = loadEnv()) {
  return new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY,
      secretAccessKey: env.R2_SECRET_KEY,
    },
  });
}
