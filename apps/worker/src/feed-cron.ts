import { getPrisma } from "@mewmo/db";

import { loadWorkerEnv } from "./env";
import { runFeedCron } from "./feeds/run-feed-cron";

async function main() {
  loadWorkerEnv();

  try {
    const result = await runFeedCron();
    console.log(JSON.stringify({ event: "feed_cron_completed", ...result }));
  } catch (error) {
    console.error("feed cron failed", error);
    process.exitCode = 1;
  } finally {
    await getPrisma().$disconnect();
  }
}

void main();
