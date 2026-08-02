import { fetchArticleFromUrl, fetchFeedDocument, fetchOutbound } from "@mewmo/content";
import { createFeedEntriesRepository, getPrisma } from "@mewmo/db";
import { normalizeClipUrlIdentity } from "@mewmo/shared";
import type { Actor } from "./actor";
import { assertScope, DomainError } from "./errors";

export type UrlCaptureResult = { action: "clip_saved" | "feed_subscribed"; status: "created" | "existing"; title: string };

export function createUrlCaptureService() {
  const db = getPrisma();
  return {
    async saveClip(actor: Actor, value: string): Promise<UrlCaptureResult> {
      assertScope(actor.scopes, "content:write");
      const url = publicUrl(value);
      const normalizedUrl = normalizeClipUrlIdentity(url);
      const existing = await db.clip.findFirst({ where: { userId: actor.userId, normalizedUrl, deletedAt: null } });
      if (existing) return { action: "clip_saved", status: "existing", title: existing.title };
      const article = await fetchArticleFromUrl(url);
      try {
        const clip = await db.clip.create({ data: { userId: actor.userId, url, normalizedUrl, title: article.title, content: article.content, favicon: article.favicon ?? null, coverImage: article.coverImage ?? null, excerpt: article.excerpt ?? null, sourceName: article.sourceName ?? null, author: article.author ?? null, publishedAt: article.publishedAt ?? null, summary: null, fetchStatus: "success", fetchError: null, fetchedAt: new Date() } });
        return { action: "clip_saved", status: "created", title: clip.title };
      } catch (error) {
        if (!isUnique(error)) throw error;
        const duplicate = await db.clip.findFirst({ where: { userId: actor.userId, normalizedUrl, deletedAt: null } });
        if (!duplicate) throw error;
        return { action: "clip_saved", status: "existing", title: duplicate.title };
      }
    },
    async subscribeFeed(actor: Actor, value: string): Promise<UrlCaptureResult> {
      assertScope(actor.scopes, "content:write");
      const sourceUrl = publicUrl(value);
      const url = await discoverFeedUrl(sourceUrl);
      const entries = await fetchFeedDocument(url);
      const existing = await db.feed.findFirst({ where: { userId: actor.userId, url, deletedAt: null } });
      if (existing) return { action: "feed_subscribed", status: "existing", title: existing.title };
      const title = new URL(url).hostname.replace(/^www\./, "");
      let createdFeedId: string | undefined;
      try {
        const feed = await db.feed.create({ data: { userId: actor.userId, url, title, type: "article" } });
        createdFeedId = feed.id;
        const entriesRepository = createFeedEntriesRepository();
        for (const entry of entries.slice(0, 10)) await entriesRepository.upsertSourceByFeedUrl(actor.userId, { feedId: feed.id, title: entry.title, url: entry.url, content: entry.content, ...(entry.excerpt ? { excerpt: entry.excerpt } : {}), sourceName: title, ...(entry.author ? { author: entry.author } : {}), ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}) });
        await db.feed.update({ where: { id: feed.id }, data: { lastFetchedAt: new Date(), lastFetchStatus: "success", lastFetchCount: Math.min(entries.length, 10) } });
        return { action: "feed_subscribed", status: "created", title };
      } catch (error) {
        if (createdFeedId) await db.feed.delete({ where: { id: createdFeedId } }).catch(() => undefined);
        if (!isUnique(error)) throw error;
        const duplicate = await db.feed.findFirst({ where: { userId: actor.userId, url, deletedAt: null } });
        if (!duplicate) throw error;
        return { action: "feed_subscribed", status: "existing", title: duplicate.title };
      }
    },
  };
}

function publicUrl(value: string) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new DomainError("invalid_state", "请提供公开的 http(s) URL。"); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) throw new DomainError("invalid_state", "请提供无需登录的公开 http(s) URL。");
  return url.href;
}

function isUnique(error: unknown): error is { code: "P2002" } { return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"; }

async function discoverFeedUrl(url: string) {
  try {
    await fetchFeedDocument(url);
    return url;
  } catch {
    const response = await fetchOutbound(url, { headers: { accept: "text/html,application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8" }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new DomainError("invalid_state", "无法读取该来源，请提供无需登录的公开 RSS 或 Atom URL。");
    const html = await response.text();
    const tag = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]).find((item) => /\brel=["'][^"']*alternate/i.test(item) && /\btype=["'][^"']*(?:rss|atom|xml)/i.test(item));
    const href = tag?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) throw new DomainError("invalid_state", "未发现可订阅的公开 RSS 或 Atom 来源。");
    return publicUrl(new URL(href, response.url || url).href);
  }
}
