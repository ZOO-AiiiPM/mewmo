/**
 * Sync API integration smoke tests.
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
let createdNoteId = "";
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

test("Sync API", async (t) => {
  await t.test("unauthenticated pull returns 401", async () => {
    const res = await fetch(`${BASE}/api/sync/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cursor: "1970-01-01T00:00:00.000Z" }),
      redirect: "manual",
    });
    assert.equal(res.status, 401);
  });

  await login();

  await t.test("authenticated pull returns records object", async () => {
    const res = await authedFetch("/api/sync/pull", {
      method: "POST",
      body: JSON.stringify({ cursor: "1970-01-01T00:00:00.000Z" }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.cursor, "response should include a cursor");
    assert.deepEqual(Object.keys(data.records).sort(), ["clip", "feed", "feed_entry", "note"]);
  });

  await t.test("push note create returns applied record", async () => {
    const title = `Sync Note ${Date.now()}`;
    const res = await authedFetch("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({
        mutations: [
          {
            entity: "note",
            op: "create",
            data: {
              title,
              content: "Created through sync push",
              pinned: true,
            },
          },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.errors.length, 0);
    assert.equal(data.applied.length, 1);
    assert.equal(data.applied[0].entity, "note");
    assert.equal(data.applied[0].record.title, title);
    assert.equal(data.applied[0].record.content, "Created through sync push");
    assert.equal(data.applied[0].record.pinned, true);
    createdNoteId = data.applied[0].record.id;
  });

  await t.test("follow-up pull with epoch cursor includes the created note", async () => {
    const res = await authedFetch("/api/sync/pull", {
      method: "POST",
      body: JSON.stringify({ cursor: "1970-01-01T00:00:00.000Z" }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    const found = data.records.note.find((note) => note.id === createdNoteId);
    assert.ok(found, "created note should be pulled");
  });

  await t.test("push note delete tombstones the note", async () => {
    const res = await authedFetch("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({
        mutations: [{ entity: "note", op: "delete", id: createdNoteId }],
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.errors.length, 0);
    assert.equal(data.applied.length, 1);
    assert.equal(data.applied[0].entity, "note");
    assert.equal(data.applied[0].record.id, createdNoteId);
    assert.ok(data.applied[0].record.deletedAt, "deleted note should include tombstone");
  });

  await t.test("push clip create/update/delete returns authoritative records", async () => {
    const createRes = await authedFetch("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({
        mutations: [
          {
            entity: "clip",
            op: "create",
            data: {
              url: `${API_TEST_ARTICLE_URL}?sync=${Date.now()}`,
              title: "Sync Clip",
              content: "<p>Clip body</p>",
              summary: "Clip body",
            },
          },
        ],
      }),
    });
    assert.equal(createRes.status, 200);
    const created = await createRes.json();
    assert.equal(created.errors.length, 0);
    assert.equal(created.applied[0].record.title, "Sync Clip");
    createdClipId = created.applied[0].record.id;

    const updateRes = await authedFetch("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({
        mutations: [
          {
            entity: "clip",
            op: "update",
            id: createdClipId,
            data: { title: "Updated Sync Clip" },
          },
        ],
      }),
    });
    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.equal(updated.errors.length, 0);
    assert.equal(updated.applied[0].record.title, "Updated Sync Clip");
    assert.ok(updated.applied[0].record.version > created.applied[0].record.version);

    const deleteRes = await authedFetch("/api/sync/push", {
      method: "POST",
      body: JSON.stringify({
        mutations: [{ entity: "clip", op: "delete", id: createdClipId }],
      }),
    });
    assert.equal(deleteRes.status, 200);
    const deleted = await deleteRes.json();
    assert.equal(deleted.errors.length, 0);
    assert.ok(deleted.applied[0].record.deletedAt, "deleted clip should include tombstone");
  });
});
