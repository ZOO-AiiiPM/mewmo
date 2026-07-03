import { Worker, type Job } from "bullmq";
import { createFeedEntriesRepository, getPrisma } from "@mewmo/db";
import {
  createMewmoQueues,
  createQueueHelpers,
  createRedisConnection,
  queueNames,
  type FeedFetchJobPayload,
} from "@mewmo/queue";

import { parseFeedXml } from "../lib/feed-parser";

interface FeedWorkerDeps {
  connection?: unknown;
  fetchFeed?: (url: string) => Promise<Response>;
}

export async function processFeedFetchJob(payload: FeedFetchJobPayload, deps: FeedWorkerDeps = {}) {
  const prisma = getPrisma();
  const feed = await prisma.feed.findFirst({
    where: { id: payload.feedId, deletedAt: null },
  });

  if (!feed) {
    return { status: "skipped", reason: "feed_not_found", upserted: 0, created: 0 };
  }

  const fetchFeed = deps.fetchFeed ?? fetch;
  const response = await fetchFeed(feed.url);
  if (!response.ok) {
    throw new Error(`Feed fetch failed for ${feed.id}: ${response.status} ${response.statusText}`);
  }

  const entries = parseFeedXml(await response.text());
  const entryRepo = createFeedEntriesRepository();
  const connection = deps.connection;
  const queueHelpers = connection ? createQueueHelpers(createMewmoQueues(connection)) : null;

  let created = 0;
  for (const entry of entries) {
    const result = await entryRepo.upsertByFeedUrl(feed.userId, {
      feedId: feed.id,
      title: entry.title,
      url: entry.url,
      content: entry.content,
      ...(entry.summary !== undefined && { summary: entry.summary }),
      ...(entry.author !== undefined && { author: entry.author }),
      ...(entry.publishedAt !== undefined && { publishedAt: entry.publishedAt }),
    });

    if (result.created) {
      created += 1;
      const savedEntry = result.entry as { id?: string };
      if (queueHelpers && savedEntry.id) {
        await queueHelpers.addSummaryJob({ userId: feed.userId, targetId: savedEntry.id, targetType: "feed_entry" });
        await queueHelpers.addTagJob({ userId: feed.userId, taggableId: savedEntry.id, taggableType: "feed_entry" });
      }
    }
  }

  await prisma.feed.update({
    where: { id: feed.id },
    data: { lastFetchedAt: new Date(), version: { increment: 1 } },
  });

  return { status: "ok", upserted: entries.length, created };
}

export function createFeedWorker(connection: unknown = createRedisConnection()) {
  return new Worker(
    queueNames.feedFetch,
    (job: Job<FeedFetchJobPayload>) => processFeedFetchJob(job.data, { connection }),
    { connection } as never,
  );
}
