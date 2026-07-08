import { startFeedRefreshScheduler } from "./jobs/feed-refresh-scheduler";
import { createFeedWorker } from "./workers/feed-worker";
import { createSummaryWorker } from "./workers/summary-worker";

createFeedWorker();
createSummaryWorker();
startFeedRefreshScheduler();

console.log("workers ready");
