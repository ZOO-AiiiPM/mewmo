import { createFeedsRepository, type DueFeedForRefresh } from "@mewmo/db";

import {
  processFeed,
  type FeedCronRecord,
  type ProcessFeedResult,
} from "./process-feed";

const FEED_CRON_BATCH_LIMIT = 50;

interface FeedsRepository {
  findDueForRefresh(now: Date, limit: number): Promise<DueFeedForRefresh[]>;
}

interface RunFeedCronDependencies {
  feedsRepository?: FeedsRepository;
  processFeed?: (
    feed: FeedCronRecord,
  ) => Promise<Pick<ProcessFeedResult, "status">>;
  now?: Date;
}

export interface FeedCronResult {
  selected: number;
  succeeded: number;
  partial: number;
  failed: number;
  skipped: number;
}

export async function runFeedCron(
  dependencies: RunFeedCronDependencies = {},
): Promise<FeedCronResult> {
  const feedsRepository =
    dependencies.feedsRepository ?? createFeedsRepository();
  const runFeed = dependencies.processFeed ?? processFeed;
  const now = dependencies.now ?? new Date();
  const feeds: FeedCronRecord[] = await feedsRepository.findDueForRefresh(
    now,
    FEED_CRON_BATCH_LIMIT,
  );
  const result: FeedCronResult = {
    selected: feeds.length,
    succeeded: 0,
    partial: 0,
    failed: 0,
    skipped: 0,
  };
  for (const feed of feeds) {
    try {
      const processed = await runFeed(feed);
      if (processed.status === "success") result.succeeded += 1;
      else if (processed.status === "partial") result.partial += 1;
      else if (processed.status === "skipped") result.skipped += 1;
      else result.failed += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
