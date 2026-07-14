import { startFeedRefreshScheduler } from "./jobs/feed-refresh-scheduler";
import { createClipWorker } from "./workers/clip-worker";
import { createFeedWorker } from "./workers/feed-worker";
import { createSummaryWorker } from "./workers/summary-worker";

export interface WorkerHandle {
  close(): Promise<void>;
}

export interface SchedulerHandle {
  stop(): void;
}

interface WorkerRuntimeDependencies {
  createWorkers?: () => WorkerHandle[];
  startScheduler?: () => SchedulerHandle;
}

export interface WorkerRuntime {
  stop(): Promise<void>;
}

function createDefaultWorkers(): WorkerHandle[] {
  return [createClipWorker(), createFeedWorker(), createSummaryWorker()];
}

export function startWorkerRuntime(dependencies: WorkerRuntimeDependencies = {}): WorkerRuntime {
  const workers = (dependencies.createWorkers ?? createDefaultWorkers)();
  const scheduler = (dependencies.startScheduler ?? startFeedRefreshScheduler)();
  let stopPromise: Promise<void> | undefined;

  return {
    stop() {
      stopPromise ??= (async () => {
        scheduler.stop();
        await Promise.all(workers.map((worker) => worker.close()));
      })();
      return stopPromise;
    },
  };
}
