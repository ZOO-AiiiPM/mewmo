import { createSummaryWorker } from "./workers/summary-worker";

export interface WorkerHandle {
  close(): Promise<void>;
}

interface WorkerRuntimeDependencies {
  createWorker?: () => WorkerHandle;
}

export interface WorkerRuntime {
  stop(): Promise<void>;
}

function createDefaultWorker(): WorkerHandle {
  return createSummaryWorker();
}

export function startWorkerRuntime(dependencies: WorkerRuntimeDependencies = {}): WorkerRuntime {
  const worker = (dependencies.createWorker ?? createDefaultWorker)();
  let stopPromise: Promise<void> | undefined;

  return {
    stop() {
      stopPromise ??= (async () => {
        await worker.close();
      })();
      return stopPromise;
    },
  };
}
