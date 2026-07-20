import { loadWorkerEnv } from "./env";

async function main() {
  loadWorkerEnv();
  const [{ getPrisma }, { runFeedCron }] = await Promise.all([
    import("@mewmo/db"),
    import("./feeds/run-feed-cron"),
  ]);

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
