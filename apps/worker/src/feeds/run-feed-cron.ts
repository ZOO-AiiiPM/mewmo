import { createFeedsRepository, type DueFeedForRefresh } from "@mewmo/db";
import { createQueueHelpers } from "@mewmo/queue";

import {
  processFeed,
  type FeedCronRecord,
  type ProcessFeedQueueHelpers,
  type ProcessFeedResult,
} from "./process-feed";

const FEED_CRON_BATCH_LIMIT = 50;

interface FeedsRepository {
  findDueForRefresh(now: Date, limit: number): Promise<DueFeedForRefresh[]>;
}

type FeedCronQueueHelpers = ProcessFeedQueueHelpers & {
  close(): Promise<void>;
};

interface RunFeedCronDependencies {
  feedsRepository?: FeedsRepository;
  processFeed?: (
    feed: FeedCronRecord,
    dependencies: { queueHelpers: ProcessFeedQueueHelpers },
  ) => Promise<Pick<ProcessFeedResult, "status">>;
  createQueueHelpers?: () => FeedCronQueueHelpers;
  now?: Date;
}

export interface FeedCronResult {
  selected: number;
  succeeded: number;
  partial: number;
  failed: number;
  skipped: number;
}

export async function runFeedCron(dependencies: RunFeedCronDependencies = {}): Promise<FeedCronResult> {
  const feedsRepository = dependencies.feedsRepository ?? createFeedsRepository();
  const runFeed = dependencies.processFeed ?? processFeed;
  const now = dependencies.now ?? new Date();
  const feeds: FeedCronRecord[] = await feedsRepository.findDueForRefresh(now, FEED_CRON_BATCH_LIMIT);
  const result: FeedCronResult = {
    selected: feeds.length,
    succeeded: 0,
    partial: 0,
    failed: 0,
    skipped: 0,
  };
  if (feeds.length === 0) return result;

  const queueHelpers = (dependencies.createQueueHelpers ?? createQueueHelpers)();
  try {
    for (const feed of feeds) {
      try {
        const processed = await runFeed(feed, { queueHelpers });
        if (processed.status === "success") result.succeeded += 1;
        else if (processed.status === "partial") result.partial += 1;
        else if (processed.status === "skipped") result.skipped += 1;
        else result.failed += 1;
      } catch {
        result.failed += 1;
      }
    }
  } finally {
    await queueHelpers.close();
  }

  return result;
}
