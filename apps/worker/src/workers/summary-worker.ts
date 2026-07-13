import { Worker, type Job } from "bullmq";
import { getPrisma } from "@mewmo/db";
import { summarizeContent, type SummaryContentInput } from "@mewmo/ai";
import { createRedisConnection, queueNames, type SummaryJobPayload } from "@mewmo/queue";

interface SummaryWorkerDeps {
  prisma?: unknown;
  summarize?: (input: SummaryContentInput) => Promise<string>;
}

interface SummaryPrismaClient {
  clip?: {
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
  feedEntry?: {
    findFirst(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<unknown>;
  };
}

interface ClipRecord {
  id: string;
  title: string;
  url: string;
  content: string;
}

interface FeedEntryRecord {
  id: string;
  title: string;
  url: string;
  content: string;
  feed?: {
    title?: string | null;
  } | null;
}

export async function processSummaryJob(payload: SummaryJobPayload, deps: SummaryWorkerDeps = {}) {
  if (payload.targetType === "note") {
    return { status: "skipped", reason: "unsupported_target_type" };
  }

  const prisma = (deps.prisma ?? getPrisma()) as SummaryPrismaClient;
  const summarize = deps.summarize ?? summarizeContent;

  if (payload.targetType === "clip") {
    const clip = (await prisma.clip?.findFirst({
      where: { id: payload.targetId, userId: payload.userId, deletedAt: null },
    })) as ClipRecord | null | undefined;

    if (!clip) {
      return { status: "skipped", reason: "target_not_found" };
    }

    const summary = await summarize({
      type: "clip",
      title: clip.title,
      source: domainFromUrl(clip.url),
      url: clip.url,
      content: clip.content,
    });

    await prisma.clip?.updateMany({
      where: { id: payload.targetId, userId: payload.userId, deletedAt: null },
      data: { summary, version: { increment: 1 } },
    });

    return { status: "ok", targetType: "clip", targetId: payload.targetId };
  }

  const entry = (await prisma.feedEntry?.findFirst({
    where: { id: payload.targetId, userId: payload.userId, deletedAt: null },
    include: { feed: { select: { title: true } } },
  })) as FeedEntryRecord | null | undefined;

  if (!entry) {
    return { status: "skipped", reason: "target_not_found" };
  }

  const summary = await summarize({
    type: "feed_entry",
    title: entry.title,
    source: entry.feed?.title ?? domainFromUrl(entry.url),
    url: entry.url,
    content: entry.content,
  });

  await prisma.feedEntry?.updateMany({
    where: { id: payload.targetId, userId: payload.userId, deletedAt: null },
    data: { summary, version: { increment: 1 } },
  });

  return { status: "ok", targetType: "feed_entry", targetId: payload.targetId };
}

export function createSummaryWorker(connection: unknown = createRedisConnection()) {
  return new Worker(
    queueNames.summary,
    (job: Job<SummaryJobPayload>) => processSummaryJob(job.data),
    { connection } as never,
  );
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
