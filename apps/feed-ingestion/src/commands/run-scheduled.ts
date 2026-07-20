import { loadFeedIngestionEnv } from "../env";
import type { AiRunEnqueuePort } from "../feeds/process-feed";

interface FeedIngestionAdapterModule {
  createFeedIngestionAiRunPort(): Promise<AiRunEnqueuePort> | AiRunEnqueuePort;
}

async function main() {
  loadFeedIngestionEnv();
  const adapterPath = process.env.FEED_INGESTION_ADAPTER_MODULE?.trim();
  if (!adapterPath) {
    throw new Error("FEED_INGESTION_ADAPTER_MODULE is required until the Foundation adapter is integrated");
  }
  const [{ getPrisma }, { runFeedCron }, adapter] = await Promise.all([
    import("@mewmo/db"),
    import("../feeds/run-feed-cron"),
    import(adapterPath) as Promise<Partial<FeedIngestionAdapterModule>>,
  ]);
  if (typeof adapter.createFeedIngestionAiRunPort !== "function") {
    throw new Error("Feed ingestion adapter must export createFeedIngestionAiRunPort()");
  }
  const aiRuns = await adapter.createFeedIngestionAiRunPort();

  try {
    const result = await runFeedCron({ aiRuns });
    console.log(JSON.stringify({ event: "feed_cron_completed", ...result }));
  } catch (error) {
    console.error("feed cron failed", error);
    process.exitCode = 1;
  } finally {
    await getPrisma().$disconnect();
  }
}

void main();
