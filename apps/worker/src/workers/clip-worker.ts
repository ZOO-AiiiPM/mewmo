import { Worker, type Job } from "bullmq";
import { createRedisConnection, queueNames, type ClipFetchJobPayload } from "@mewmo/queue";

interface ClipWorkerEnv {
  NEXTAUTH_URL?: string;
  FEED_REFRESH_BASE_URL?: string;
  FEED_CRON_SECRET?: string;
}

interface ClipWorkerDeps {
  fetchBackground?: typeof fetch;
  env?: ClipWorkerEnv;
  timeoutMs?: number;
}

export async function processClipFetchJob(payload: ClipFetchJobPayload, deps: ClipWorkerDeps = {}) {
  const env = deps.env ?? process.env;
  const baseUrl = env.FEED_REFRESH_BASE_URL ?? env.NEXTAUTH_URL ?? "http://localhost:3000";
  const endpoint = new URL(`/api/clips/${encodeURIComponent(payload.clipId)}?background=1`, baseUrl).toString();
  const response = await (deps.fetchBackground ?? fetch)(endpoint, {
    method: "POST",
    headers: env.FEED_CRON_SECRET ? { authorization: `Bearer ${env.FEED_CRON_SECRET}` } : {},
    signal: AbortSignal.timeout(deps.timeoutMs ?? 30_000),
  });
  if (!response.ok) {
    throw new Error(`Clip background fetch failed: ${response.status}`);
  }
  return response.json() as Promise<{ status: string }>;
}

export function createClipWorker(connection: unknown = createRedisConnection()) {
  return new Worker(
    queueNames.clipFetch,
    (job: Job<ClipFetchJobPayload>) => processClipFetchJob(job.data),
    { connection } as never,
  );
}
