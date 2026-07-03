/**
 * Feeds API integration smoke tests.
 * Run with: node --test tests/unit/feeds-api.test.mjs
 * Requires: dev server running on localhost:3000 + test user zoo@mewmo.app/test123
 */
import assert from "node:assert/strict";
import test from "node:test";

const BASE = "http://localhost:3000";
let cookies = "";
let createdFeedId = "";
let createdEntryId = "";

async function login() {
  const res = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "zoo@mewmo.app", password: "test123" }),
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
    const res = await authedFetch("/api/feeds", {
      method: "POST",
      body: JSON.stringify({
        url: `https://example.com/rss-${Date.now()}.xml`,
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

  await t.test("GET /api/feeds/[id]/entries returns an array", async () => {
    const res = await authedFetch(`/api/feeds/${createdFeedId}/entries`);
    assert.equal(res.status, 200);
    const entries = await res.json();
    assert.ok(Array.isArray(entries), "response should be an array");
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
