import { createSummaryWorker } from "./workers/summary-worker";
import { startBackgroundJobRunner } from "./jobs/background-job-runner";

export interface WorkerHandle {
  close(): Promise<void>;
}

interface WorkerRuntimeDependencies {
  createWorker?: () => WorkerHandle;
  createBackgroundJobRunner?: () => WorkerHandle;
}

export interface WorkerRuntime {
  stop(): Promise<void>;
}

function createDefaultWorker(): WorkerHandle {
  return createSummaryWorker();
}

export function startWorkerRuntime(dependencies: WorkerRuntimeDependencies = {}): WorkerRuntime {
  const worker = (dependencies.createWorker ?? createDefaultWorker)();
  const backgroundJobRunner = (dependencies.createBackgroundJobRunner ?? startBackgroundJobRunner)();
  let stopPromise: Promise<void> | undefined;

  return {
    stop() {
      stopPromise ??= (async () => {
        await Promise.all([worker.close(), backgroundJobRunner.close()]);
      })();
      return stopPromise;
    },
  };
}
