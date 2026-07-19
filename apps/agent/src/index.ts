import { startFeedRefreshScheduler } from "./jobs/feed-refresh-scheduler";
import { createFeedWorker } from "./workers/feed-worker";
import { createSummaryWorker } from "./workers/summary-worker";
import {
  createVideoAnalysisWorker,
  createVideoMetadataWorker,
  createVideoTranscriptWorker,
} from "./workers/video-workers";

createFeedWorker();
createSummaryWorker();
createVideoMetadataWorker();
createVideoTranscriptWorker();
createVideoAnalysisWorker();
startFeedRefreshScheduler();

console.log("workers ready");
