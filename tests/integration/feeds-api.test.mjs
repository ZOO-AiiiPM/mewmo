/**
 * Feeds API integration smoke tests.
 * Run with: pnpm test:integration
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createAiRunService } from "../../packages/application/src/index.ts";
import { fetchFeedDocument } from "../../packages/content/src/index.ts";
import { getPrisma } from "../../packages/db/src/client.ts";
import { processFeed } from "../../apps/feed-ingestion/src/feeds/process-feed.ts";
import { runFeedCron } from "../../apps/feed-ingestion/src/feeds/run-feed-cron.ts";
import {
  API_BASE as BASE,
  API_TEST_ARTICLE_URL,
  API_TEST_EMAIL,
  API_TEST_PASSWORD,
} from "./api-test-env.mjs";

let cookies = "";
let createdFeedId = "";
let createdEntryId = "";
let createdFeedUrl = "";

async function assertFeedEntriesHaveQueuedAiRuns(feedId, expectedEntryCount) {
  const prisma = getPrisma();
  const entries = await prisma.feedEntry.findMany({
    where: { feedId },
    select: { id: true, version: true, summary: true },
  });
  assert.equal(entries.length, expectedEntryCount);
  assert.ok(entries.every((entry) => entry.summary === null));

  const runs = await prisma.aiRun.findMany({
    where: {
      targetType: "feed_entry",
      targetId: { in: entries.map((entry) => entry.id) },
      kind: { in: ["summary", "embedding"] },
    },
  });
  assert.equal(runs.length, expectedEntryCount * 2);

  for (const entry of entries) {
    for (const kind of ["summary", "embedding"]) {
      const run = runs.find((candidate) => (
        candidate.kind === kind && candidate.targetId === entry.id
      ));
      assert.ok(run, `${kind} run should exist for feed entry ${entry.id}`);
      assert.equal(run.status, "queued");
      assert.equal(run.inputVersion, entry.version);
      assert.equal(run.idempotencyKey, `${kind}:feed_entry:${entry.id}:v${entry.version}`);
    }
  }
}

async function login() {
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: API_TEST_EMAIL, password: API_TEST_PASSWORD }),
    redirect: "manual",
  });
  assert.equal(res.status, 200, "login should return 200");
  const setCookie = res.headers.getSetCookie?.() ?? [];
  cookies = setCookie.map((c) => c.split(";")[0]).join("; ");
  assert.ok(cookies.length > 0, "should receive session cookie");
}

function authedFetch(path, opts = {}) {
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...opts.headers, Cookie: cookies, "Content-Type": "application/json" },
    redirect: "manual",
  });
}

test("Feeds API", async (t) => {
  await login();

  await t.test("POST /api/feeds creates a feed", async () => {
    createdFeedUrl = `${API_TEST_ARTICLE_URL}?rss=${Date.now()}`;
    const res = await authedFetch("/api/feeds", {
      method: "POST",
      body: JSON.stringify({
        url: createdFeedUrl,
        title: "Test Feed from TDD",
        description: "Created by feeds API smoke test",
      }),
    });
    assert.equal(res.status, 201);
    const feed = await res.json();
    assert.ok(feed.id, "should have an id");
    assert.equal(feed.title, "Test Feed from TDD");
    assert.equal(feed.initialFetch.status, "success");
    createdFeedId = feed.id;
  });

  await t.test("GET /api/feeds returns the created feed", async () => {
    const res = await authedFetch("/api/feeds");
    assert.equal(res.status, 200);
    const feeds = await res.json();
    assert.ok(Array.isArray(feeds), "response should be an array");
    assert.ok(feeds.some((feed) => feed.id === createdFeedId), "created feed should be listed");
  });

  await t.test("the synchronous create response has already stored the first entry", async () => {
    const res = await authedFetch(`/api/feeds/${createdFeedId}/entries`);
    assert.equal(res.status, 200);
    const entries = await res.json();
    assert.ok(entries.length > 0, "the first feed entry should exist when create returns");
    assert.equal(entries[0].title, "Fixture Entry");
    createdEntryId = entries[0]?.id ?? "";
  });

  await t.test("Cron does not immediately refill history excluded by the initial import", async () => {
    const result = await runFeedCron();
    assert.equal(result.selected, 0);
  });

  await t.test("initialEntryLimit stores only the requested first five entries", async () => {
    const res = await authedFetch("/api/feeds", {
      method: "POST",
      body: JSON.stringify({
        url: `${API_TEST_ARTICLE_URL}?rss=${Date.now()}&items=12`,
        title: "Five-entry feed",
        initialEntryLimit: 5,
      }),
    });
    assert.equal(res.status, 201);
    const feed = await res.json();
    assert.equal(feed.initialFetch.fetched, 5);
    assert.equal(feed.initialFetch.created, 5);

    const entriesRes = await authedFetch(`/api/feeds/${feed.id}/entries`);
    assert.equal(entriesRes.status, 200);
    assert.equal((await entriesRes.json()).length, 5);

    const feedRecord = await getPrisma().feed.findUniqueOrThrow({ where: { id: feed.id } });
    const allowedPrivateOrigins = [new URL(API_TEST_ARTICLE_URL).origin];
    const cronResult = await processFeed(feedRecord, {
      fetchFeed: (url) => fetchFeedDocument(url, { allowedPrivateOrigins }),
    });
    assert.equal(cronResult.upserted, 0, "Cron must stop at the initial cursor instead of importing the other seven old entries");
    const afterCron = await authedFetch(`/api/feeds/${feed.id}/entries`);
    const entriesAfterCron = await afterCron.json();
    assert.equal(entriesAfterCron.length, 5);
    await assertFeedEntriesHaveQueuedAiRuns(feed.id, 5);
    assert.equal((await authedFetch(`/api/feeds/${feed.id}`, { method: "DELETE" })).status, 200);
  });

  await t.test("initialEntryLimit can import more than the previous fixed ten", async () => {
    const res = await authedFetch("/api/feeds", {
      method: "POST",
      body: JSON.stringify({
        url: `${API_TEST_ARTICLE_URL}?rss=${Date.now()}&items=12`,
        title: "Twenty-entry limit feed",
        initialEntryLimit: 20,
      }),
    });
    assert.equal(res.status, 201);
    const feed = await res.json();
    assert.equal(feed.initialFetch.fetched, 12);
    assert.equal(feed.initialFetch.created, 12);
    assert.equal((await authedFetch(`/api/feeds/${feed.id}`, { method: "DELETE" })).status, 200);
  });

  await t.test("one Cron refresh imports all twelve entries newer than the saved cursor", async () => {
    const initialUrl = `${API_TEST_ARTICLE_URL}?rss=${Date.now()}&items=1&start=13`;
    const res = await authedFetch("/api/feeds", {
      method: "POST",
      body: JSON.stringify({
        url: initialUrl,
        title: "Incremental feed",
        initialEntryLimit: 5,
      }),
    });
    assert.equal(res.status, 201);
    const feed = await res.json();
    const nextUrl = `${API_TEST_ARTICLE_URL}?rss=${Date.now()}&items=13&start=1`;
    await getPrisma().feed.update({ where: { id: feed.id }, data: { url: nextUrl } });
    const feedRecord = await getPrisma().feed.findUniqueOrThrow({ where: { id: feed.id } });
    const allowedPrivateOrigins = [new URL(API_TEST_ARTICLE_URL).origin];

    const result = await processFeed(feedRecord, {
      fetchFeed: (url) => fetchFeedDocument(url, { allowedPrivateOrigins }),
      aiRuns: createAiRunService(),
    });

    assert.equal(result.upserted, 12);
    assert.equal(result.created, 12);
    await assertFeedEntriesHaveQueuedAiRuns(feed.id, 13);
    assert.equal((await authedFetch(`/api/feeds/${feed.id}`, { method: "DELETE" })).status, 200);
  });

  await t.test("a failed initial RSS read leaves no half-created subscription", async () => {
    const failedUrl = `${API_TEST_ARTICLE_URL}?rss=${Date.now()}&fail=1`;
    const res = await authedFetch("/api/feeds", {
      method: "POST",
      body: JSON.stringify({
        url: failedUrl,
        title: "Unavailable feed",
        initialEntryLimit: 5,
      }),
    });

    assert.equal(res.status, 502);
    assert.equal(await getPrisma().feed.count({ where: { url: failedUrl } }), 0);
  });

  await t.test("unsupported initialEntryLimit values are rejected", async () => {
    const res = await authedFetch("/api/feeds", {
      method: "POST",
      body: JSON.stringify({
        url: `${API_TEST_ARTICLE_URL}?rss=${Date.now()}&items=12`,
        title: "Invalid limit feed",
        initialEntryLimit: 7,
      }),
    });
    assert.equal(res.status, 400);
  });

  await t.test("PATCH /api/feed-entries/[id] can mark read/unread when an entry exists", async () => {
    if (!createdEntryId) {
      return;
    }

    const readRes = await authedFetch(`/api/feed-entries/${createdEntryId}`, {
      method: "PATCH",
      body: JSON.stringify({ read: true }),
    });
    assert.equal(readRes.status, 200);
    assert.ok((await readRes.json()).readAt, "entry should be marked read");

    const unreadRes = await authedFetch(`/api/feed-entries/${createdEntryId}`, {
      method: "PATCH",
      body: JSON.stringify({ read: false }),
    });
    assert.equal(unreadRes.status, 200);
    assert.equal((await unreadRes.json()).readAt, null);
  });

  await t.test("DELETE /api/feeds/[id] permanently deletes the feed and entries", async () => {
    const res = await authedFetch(`/api/feeds/${createdFeedId}`, { method: "DELETE" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);

    const prisma = getPrisma();
    assert.equal(await prisma.feed.findUnique({ where: { id: createdFeedId } }), null);
    assert.equal(await prisma.feedEntry.count({ where: { feedId: createdFeedId } }), 0);
  });

  await t.test("the same URL can be subscribed again after permanent deletion", async () => {
    const res = await authedFetch("/api/feeds", {
      method: "POST",
      body: JSON.stringify({
        url: createdFeedUrl,
        title: "Re-added Feed",
        description: "Recreated after permanent deletion",
      }),
    });
    assert.equal(res.status, 201);
    const feed = await res.json();
    assert.notEqual(feed.id, createdFeedId);
    assert.equal(feed.existing, false);
  });

  await t.test("a legacy soft-deleted row no longer causes a 409", async () => {
    const staleUrl = `${API_TEST_ARTICLE_URL}?legacy=${Date.now()}`;
    await getPrisma().feed.create({
      data: {
        userId: (await getPrisma().user.findUniqueOrThrow({ where: { email: API_TEST_EMAIL } })).id,
        url: staleUrl,
        type: "article",
        title: "Legacy deleted feed",
        deletedAt: new Date(),
      },
    });

    const res = await authedFetch("/api/feeds", {
      method: "POST",
      body: JSON.stringify({ url: staleUrl, title: "Restored as new feed" }),
    });
    assert.equal(res.status, 201);
    const feed = await res.json();
    assert.equal(feed.existing, false);
  });

  await t.test("unauthenticated requests return 401", async () => {
    const res = await fetch(`${BASE}/api/feeds`, { redirect: "manual" });
    assert.equal(res.status, 401);
  });
});
