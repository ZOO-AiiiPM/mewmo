import { loadFeedIngestionEnv } from "../env";
import type { AiRunEnqueuePort } from "../feeds/process-feed";
import { createAiRunService } from "@mewmo/application";

async function main() {
  loadFeedIngestionEnv();
  const [{ getPrisma }, { runFeedCron }] = await Promise.all([
    import("@mewmo/db"),
    import("../feeds/run-feed-cron"),
  ]);
  const aiRuns: AiRunEnqueuePort = createAiRunService();

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
