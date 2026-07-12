/**
 * Feeds API integration smoke tests.
 * Run with: pnpm test:integration
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  API_BASE as BASE,
  API_TEST_ARTICLE_URL,
  API_TEST_EMAIL,
  API_TEST_PASSWORD,
} from "./api-test-env.mjs";

let cookies = "";
let createdFeedId = "";
let createdEntryId = "";

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

async function waitForFeedEntries(feedId, timeoutMs = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const res = await authedFetch(`/api/feeds/${feedId}/entries`);
    assert.equal(res.status, 200);
    const entries = await res.json();
    if (entries.length > 0) return entries;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return [];
}

test("Feeds API", async (t) => {
  await login();

  await t.test("POST /api/feeds creates a feed", async () => {
    const res = await authedFetch("/api/feeds", {
      method: "POST",
      body: JSON.stringify({
        url: `${API_TEST_ARTICLE_URL}?rss=${Date.now()}`,
        title: "Test Feed from TDD",
        description: "Created by feeds API smoke test",
      }),
    });
    assert.equal(res.status, 201);
    const feed = await res.json();
    assert.ok(feed.id, "should have an id");
    assert.equal(feed.title, "Test Feed from TDD");
    createdFeedId = feed.id;
  });

  await t.test("GET /api/feeds returns the created feed", async () => {
    const res = await authedFetch("/api/feeds");
    assert.equal(res.status, 200);
    const feeds = await res.json();
    assert.ok(Array.isArray(feeds), "response should be an array");
    assert.ok(feeds.some((feed) => feed.id === createdFeedId), "created feed should be listed");
  });

  await t.test("response-after first fetch stores the first entry promptly", async () => {
    const entries = await waitForFeedEntries(createdFeedId);
    assert.ok(entries.length > 0, "the first feed entry should appear without waiting for the 60-second scheduler");
    assert.equal(entries[0].title, "Example Article");
    createdEntryId = entries[0]?.id ?? "";
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

  await t.test("DELETE /api/feeds/[id] soft-deletes", async () => {
    const res = await authedFetch(`/api/feeds/${createdFeedId}`, { method: "DELETE" });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  });

  await t.test("unauthenticated requests return 401", async () => {
    const res = await fetch(`${BASE}/api/feeds`, { redirect: "manual" });
    assert.equal(res.status, 401);
  });
});
