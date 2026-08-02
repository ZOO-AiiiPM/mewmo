import { fetchArticleFromUrl } from "@mewmo/content";
import { createFeedsRepository, getPrisma } from "@mewmo/db";
import { normalizeClipUrlIdentity } from "@mewmo/shared";
import type { Actor } from "./actor";
import { enqueueArticleRuns } from "./ai-run-service";
import { assertScope, DomainError } from "./errors";
import { fetchInitialFeed, type InitialFeedRecord } from "./feed-initial-fetch";
import { requestFeedRefresh } from "./feed-refresh-request";

export type UrlCaptureResult = { action: "clip_saved" | "feed_subscribed"; status: "created" | "existing"; title: string };
type FeedCreateInput = { url: string; title: string; type: "article" | "media" | "video" | "podcast"; description?: string; favicon?: string; refreshInterval: number };

export async function createFeedSubscriptionCommand<TFeed, TFetch extends { status: "success" | "error"; error?: string }>(
  actor: Actor,
  input: { url: string; title: string; type: "article" | "media" | "video" | "podcast"; description?: string | undefined; favicon?: string | undefined; refreshInterval: number; initialEntryLimit: number },
  deps: {
    purgeDeletedDuplicate(userId: string, url: string, type: typeof input.type): Promise<unknown>;
    create(userId: string, value: FeedCreateInput): Promise<TFeed>;
    initialFetch(userId: string, feed: TFeed, limit: number): Promise<TFetch>;
    delete(userId: string, id: string): Promise<{ count: number }>;
    id(feed: TFeed): string;
  },
) {
  assertScope(actor.scopes, "content:write");
  await deps.purgeDeletedDuplicate(actor.userId, input.url, input.type);
  const feed = await deps.create(actor.userId, { url: input.url, title: input.title, type: input.type, refreshInterval: input.refreshInterval, ...(input.description === undefined ? {} : { description: input.description }), ...(input.favicon === undefined ? {} : { favicon: input.favicon }) });
  const initialFetch = await deps.initialFetch(actor.userId, feed, input.initialEntryLimit);
  if (initialFetch.status === "error") {
    const rollback = await deps.delete(actor.userId, deps.id(feed));
    if (rollback.count === 0) throw new DomainError("invalid_state", "Feed rollback did not remove the created subscription");
  }
  return { feed, initialFetch };
}

type FeedInput = { url: string; title: string; type: "article" | "media" | "video" | "podcast"; description?: string | undefined; favicon?: string | undefined; refreshInterval: number; initialEntryLimit: number };
type FeedRecord = InitialFeedRecord & { id: string; title: string; lastFetchStatus: string; lastFetchStartedAt: Date | null };

/** The single persistence path for Web and Agent feed subscriptions. */
export function createFeedSubscriptionService() {
  const feeds = createFeedsRepository();
  return {
    async subscribeFeed(actor: Actor, input: FeedInput) {
      try {
        const { feed, initialFetch } = await createFeedSubscriptionCommand(actor, input, {
          purgeDeletedDuplicate: feeds.purgeDeletedDuplicate,
          create: feeds.create,
          initialFetch: (userId, record, limit) => fetchInitialFeed(userId, record as FeedRecord, { limit }),
          delete: feeds.delete,
          id: (record) => (record as FeedRecord).id,
        });
        const record = feed as FeedRecord;
        if (initialFetch.status === "error") {
          throw new DomainError("invalid_state", initialFetch.error ?? "Initial feed import failed");
        }
        return { action: "feed_subscribed" as const, status: "created" as const, title: record.title, record, initialFetch };
      } catch (error) {
        if (!isUnique(error)) throw error;
        const existing = await getPrisma().feed.findFirst({ where: { userId: actor.userId, url: input.url, type: input.type, deletedAt: null } }) as FeedRecord | null;
        if (!existing) throw error;
        if (existing.lastFetchStatus === "error" || existing.lastFetchStatus === "partial") {
          await requestFeedRefresh(actor.userId, existing.id);
        }
        return { action: "feed_subscribed" as const, status: "existing" as const, title: existing.title, record: existing };
      }
    },
  };
}

export function createUrlCaptureService(options: { fetchClip?: typeof fetchArticleFromUrl; enqueueClip?: (clip: { id: string; version: number }, userId: string) => Promise<void> } = {}) {
  const db = getPrisma();
  const enqueueClip = options.enqueueClip ?? ((clip: { id: string; version: number }, userId: string) => enqueueArticleRuns({ userId, targetType: "clip", targetId: clip.id, inputVersion: clip.version }).then(() => undefined));
  return {
    async saveClip(actor: Actor, value: string) {
      assertScope(actor.scopes, "content:write");
      const url = publicUrl(value);
      const normalizedUrl = normalizeClipUrlIdentity(url);
      const existing = await db.clip.findFirst({ where: { userId: actor.userId, normalizedUrl, deletedAt: null } });
      if (existing) return { action: "clip_saved" as const, status: "existing" as const, title: existing.title, record: existing };
      let article: Awaited<ReturnType<typeof fetchArticleFromUrl>>;
      try {
        article = await (options.fetchClip ?? fetchArticleFromUrl)(url);
      } catch (error) {
        if (error instanceof DomainError) throw error;
        throw new DomainError("invalid_state", error instanceof Error ? error.message : "Could not fetch clip", { timeout: isTimeout(error) });
      }
      try {
        const clip = await db.clip.create({ data: { userId: actor.userId, url, normalizedUrl, title: article.title, content: article.content, favicon: article.favicon ?? null, coverImage: article.coverImage ?? null, excerpt: article.excerpt ?? null, sourceName: article.sourceName ?? null, author: article.author ?? null, publishedAt: article.publishedAt ?? null, summary: null, fetchStatus: "success", fetchError: null, fetchedAt: new Date() } });
        await enqueueClipSafely(enqueueClip, clip, actor.userId);
        return { action: "clip_saved" as const, status: "created" as const, title: clip.title, record: clip };
      } catch (error) {
        if (!isUnique(error)) throw error;
        const duplicate = await db.clip.findFirst({ where: { userId: actor.userId, normalizedUrl } });
        if (!duplicate) throw new DomainError("already_exists", "Clip already exists");
        if (!duplicate.deletedAt) return { action: "clip_saved" as const, status: "existing" as const, title: duplicate.title, record: duplicate };
        const restored = await db.clip.update({ where: { id: duplicate.id }, data: { deletedAt: null, url, title: article.title, content: article.content, favicon: article.favicon ?? null, coverImage: article.coverImage ?? null, excerpt: article.excerpt ?? null, sourceName: article.sourceName ?? null, author: article.author ?? null, publishedAt: article.publishedAt ?? null, fetchStatus: "success", fetchError: null, fetchedAt: new Date(), version: { increment: 1 } } });
        await enqueueClipSafely(enqueueClip, restored, actor.userId);
        return { action: "clip_saved" as const, status: "existing" as const, title: restored.title, record: restored };
      }
    },
  };
}

function publicUrl(value: string) {
  const normalized = value.trim();
  let url: URL;
  try { url = new URL(normalized); } catch { throw new DomainError("invalid_state", "请提供公开的 http(s) URL。"); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) throw new DomainError("invalid_state", "请提供无需登录的公开 http(s) URL。");
  return normalized;
}

async function enqueueClipSafely(enqueue: (clip: { id: string; version: number }, userId: string) => Promise<void>, clip: { id: string; version: number }, userId: string) {
  try {
    await enqueue(clip, userId);
  } catch (error) {
    console.error("Failed to enqueue clip AI workflows", error);
  }
}

function isUnique(error: unknown): error is { code: "P2002" } { return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"; }
function isTimeout(error: unknown) { return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"); }
