import {
  createBackgroundJobsRepository,
  FEED_INITIAL_IMPORT_JOB_TYPE,
  type ClaimedBackgroundJob,
} from "@mewmo/db";

import { processFeedEntryJob } from "./process-feed-entry-job";
import { processInitialFeedImportJob } from "./process-initial-feed-import-job";

const IDLE_POLL_MS = 30_000;

interface BackgroundJobsRepository {
  enqueueMissingFeedEntryProcessJobs(limit?: number): Promise<number>;
  claimNext(): Promise<ClaimedBackgroundJob | null>;
  complete(job: ClaimedBackgroundJob): Promise<{ count: number }>;
  fail(job: ClaimedBackgroundJob, error: string): Promise<{ count: number }>;
}

interface BackgroundJobRunnerDependencies {
  repository?: BackgroundJobsRepository;
  processJob?: (job: ClaimedBackgroundJob) => Promise<unknown>;
  pollMs?: number;
  setTimer?: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  onError?: (error: unknown) => void;
}

export interface BackgroundJobRunner {
  close(): Promise<void>;
}

export function startBackgroundJobRunner(
  dependencies: BackgroundJobRunnerDependencies = {},
): BackgroundJobRunner {
  const repository =
    dependencies.repository ?? createBackgroundJobsRepository();
  const processJob = dependencies.processJob ?? ((job: ClaimedBackgroundJob) =>
    job.type === FEED_INITIAL_IMPORT_JOB_TYPE
      ? processInitialFeedImportJob(job.payload)
      : processFeedEntryJob(job.payload));
  const pollMs = dependencies.pollMs ?? IDLE_POLL_MS;
  const setTimer =
    dependencies.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer =
    dependencies.clearTimer ?? ((value) => clearTimeout(value));
  const onError =
    dependencies.onError ??
    ((error: unknown) => console.error("background job runner failed", error));
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activeRun: Promise<void> = Promise.resolve();

  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimer(() => {
      activeRun = runCycle();
    }, delay);
  };

  const drain = async () => {
    while (!stopped) {
      const job = await repository.claimNext();
      if (!job) break;
      try {
        await processJob(job);
        await repository.complete(job);
      } catch (error) {
        await repository.fail(
          job,
          error instanceof Error ? error.message : "Background job failed",
        );
      }
    }
  };

  const runCycle = async () => {
    try {
      await drain();
    } catch (error) {
      onError(error);
    } finally {
      schedule(pollMs);
    }
  };

  activeRun = (async () => {
    try {
      await repository.enqueueMissingFeedEntryProcessJobs(500);
    } catch (error) {
      onError(error);
    }
    await runCycle();
  })();

  return {
    async close() {
      stopped = true;
      if (timer) clearTimer(timer);
      await activeRun;
    },
  };
}
