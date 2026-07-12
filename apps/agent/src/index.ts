import { startFeedRefreshScheduler } from "./jobs/feed-refresh-scheduler";
import { createClipWorker } from "./workers/clip-worker";
import { createFeedWorker } from "./workers/feed-worker";
import { createSummaryWorker } from "./workers/summary-worker";

createClipWorker();
createFeedWorker();
createSummaryWorker();
startFeedRefreshScheduler();

console.log("workers ready");
