import { S3Client } from "@aws-sdk/client-s3";
import { loadEnv } from "@mewmo/shared";

interface R2ClientEnv {
  R2_ENDPOINT?: string | undefined;
  R2_ACCESS_KEY?: string | undefined;
  R2_SECRET_KEY?: string | undefined;
}

export function createStorageClient(env: R2ClientEnv = loadEnv()) {
  if (!env.R2_ENDPOINT || !env.R2_ACCESS_KEY || !env.R2_SECRET_KEY) {
    throw new Error("Invalid R2 storage configuration");
  }

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
