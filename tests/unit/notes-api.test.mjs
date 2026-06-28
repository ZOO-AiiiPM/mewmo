/**
 * Notes API integration tests.
 * Run with: node --test tests/unit/notes-api.test.mjs
 * Requires: dev server running on localhost:3000 + test user zoo@mewmo.app/test123
 */
import assert from "node:assert/strict";
import test from "node:test";

const BASE = "http://localhost:3000";
let cookies = "";
let createdNoteId = "";

// Helper: login and get session cookie
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

test("Notes API", async (t) => {
  await login();

  await t.test("GET /api/notes returns 200 with array", async () => {
    const res = await authedFetch("/api/notes");
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data), "response should be an array");
  });

  await t.test("POST /api/notes creates a note", async () => {
    const res = await authedFetch("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Test Note from TDD" }),
    });
    assert.equal(res.status, 201);
    const note = await res.json();
    assert.ok(note.id, "should have an id");
    assert.equal(note.title, "Test Note from TDD");
    assert.equal(note.content, "");
    assert.ok(note.slug, "should have a slug");
    createdNoteId = note.id;
  });

  await t.test("GET /api/notes/[id] returns the created note", async () => {
    const res = await authedFetch(`/api/notes/${createdNoteId}`);
    assert.equal(res.status, 200);
    const note = await res.json();
    assert.equal(note.id, createdNoteId);
    assert.equal(note.title, "Test Note from TDD");
  });

  await t.test("PATCH /api/notes/[id] updates content", async () => {
    const res = await authedFetch(`/api/notes/${createdNoteId}`, {
      method: "PATCH",
      body: JSON.stringify({ content: "# Hello World\n\nUpdated content." }),
    });
    assert.equal(res.status, 200);
    const note = await res.json();
    assert.equal(note.content, "# Hello World\n\nUpdated content.");
    assert.ok(note.version >= 2, "version should increment");
  });

  await t.test("PATCH /api/notes/[id] updates title", async () => {
    const res = await authedFetch(`/api/notes/${createdNoteId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Renamed Note" }),
    });
    assert.equal(res.status, 200);
    const note = await res.json();
    assert.equal(note.title, "Renamed Note");
  });

  await t.test("DELETE /api/notes/[id] soft-deletes", async () => {
    const res = await authedFetch(`/api/notes/${createdNoteId}`, {
      method: "DELETE",
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
  });

  await t.test("GET /api/notes/[id] returns 404 after delete", async () => {
    const res = await authedFetch(`/api/notes/${createdNoteId}`);
    assert.equal(res.status, 404);
  });

  await t.test("deleted note not in list", async () => {
    const res = await authedFetch("/api/notes");
    const data = await res.json();
    const found = data.find((n) => n.id === createdNoteId);
    assert.equal(found, undefined, "deleted note should not appear in list");
  });

  await t.test("unauthenticated requests return 401", async () => {
    const res = await fetch(`${BASE}/api/notes`, { redirect: "manual" });
    assert.equal(res.status, 401);
  });
});
