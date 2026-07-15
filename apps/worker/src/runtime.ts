import { createSummaryWorker } from "./workers/summary-worker";

export interface WorkerHandle {
  close(): Promise<void>;
}

interface WorkerRuntimeDependencies {
  createWorkers?: () => WorkerHandle[];
}

export interface WorkerRuntime {
  stop(): Promise<void>;
}

function createDefaultWorkers(): WorkerHandle[] {
  return [createSummaryWorker()];
}

export function startWorkerRuntime(dependencies: WorkerRuntimeDependencies = {}): WorkerRuntime {
  const workers = (dependencies.createWorkers ?? createDefaultWorkers)();
  let stopPromise: Promise<void> | undefined;

  return {
    stop() {
      stopPromise ??= (async () => {
        await Promise.all(workers.map((worker) => worker.close()));
      })();
      return stopPromise;
    },
  };
}
