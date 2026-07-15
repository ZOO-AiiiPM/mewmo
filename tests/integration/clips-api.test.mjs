/**
 * Clips API integration tests.
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
let createdClipId = "";

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

const clipPayload = {
  url: API_TEST_ARTICLE_URL,
  title: "Example Article",
  content: "<p>Readable body</p>",
  summary: "Readable body",
};

test("Clips API", async (t) => {
  await login();

  await t.test("unauthenticated list returns 401", async () => {
    const res = await fetch(`${BASE}/api/clips`, { redirect: "manual" });
    assert.equal(res.status, 401);
  });

  await t.test("POST /api/clips creates a clip", async () => {
    const startedAt = Date.now();
    const res = await authedFetch("/api/clips", {
      method: "POST",
      body: JSON.stringify(clipPayload),
    });
    assert.equal(res.status, 201);
    assert.ok(Date.now() - startedAt < 2000, "clip persistence should not wait for remote extraction");
    const clip = await res.json();
    assert.ok(clip.id, "should have an id");
    createdClipId = clip.id;
    assert.equal(clip.url, clipPayload.url);
    assert.equal(clip.title, clipPayload.title);
    assert.match(clip.content, /Readable body/);
    assert.equal(clip.summary, clipPayload.summary);
    assert.equal(clip.version, 1);
  });

  await t.test("equivalent URL returns the existing clip", async () => {
    const duplicateUrl = `${clipPayload.url.replace(/\/$/, "")}/?utm_source=integration#section`;
    const res = await authedFetch("/api/clips", {
      method: "POST",
      body: JSON.stringify({ ...clipPayload, url: duplicateUrl }),
    });
    assert.equal(res.status, 200);
    const clip = await res.json();
    assert.equal(clip.id, createdClipId);
    assert.equal(clip.existing, true);
  });

  await t.test("GET /api/clips returns the created clip", async () => {
    const res = await authedFetch("/api/clips");
    assert.equal(res.status, 200);
    const clips = await res.json();
    assert.ok(Array.isArray(clips), "response should be an array");
    const clip = clips.find((item) => item.id === createdClipId);
    assert.ok(clip, "created clip should appear in list");
    assert.equal(clip.title, clipPayload.title);
  });

  await t.test("GET /api/clips/[id] returns the created clip", async () => {
    const res = await authedFetch(`/api/clips/${createdClipId}`);
    assert.equal(res.status, 200);
    const clip = await res.json();
    assert.equal(clip.id, createdClipId);
    assert.match(clip.content, /Readable body/);
  });

  await t.test("PATCH /api/clips/[id] updates title and content", async () => {
    const res = await authedFetch(`/api/clips/${createdClipId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: "Updated Example Article",
        content: "Readable body as plain text.",
      }),
    });
    assert.equal(res.status, 200);
    const clip = await res.json();
    assert.equal(clip.title, "Updated Example Article");
    assert.equal(clip.content, "Readable body as plain text.");
    assert.ok(clip.version >= 2, "version should increment");
  });

  await t.test("PATCH /api/clips/[id] rejects empty updates", async () => {
    const res = await authedFetch(`/api/clips/${createdClipId}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  await t.test("DELETE /api/clips/[id] soft-deletes", async () => {
    const beforeRes = await authedFetch(`/api/clips/${createdClipId}`);
    const before = await beforeRes.json();

    const res = await authedFetch(`/api/clips/${createdClipId}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(data.version > before.version, "delete should increment version");
  });

  await t.test("GET /api/clips/[id] returns 404 after delete", async () => {
    const res = await authedFetch(`/api/clips/${createdClipId}`);
    assert.equal(res.status, 404);
  });
});
