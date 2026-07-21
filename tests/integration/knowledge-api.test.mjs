/**
 * Knowledge base API integration tests.
 * Run with: pnpm test:integration
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  API_BASE as BASE,
  API_TEST_EMAIL,
  API_TEST_PASSWORD,
} from "./api-test-env.mjs";

let cookies = "";

async function login() {
  const response = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: API_TEST_EMAIL, password: API_TEST_PASSWORD }),
    redirect: "manual",
  });
  assert.equal(response.status, 200, "login should return 200");
  cookies = (response.headers.getSetCookie?.() ?? [])
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
  assert.ok(cookies.length > 0, "should receive session cookie");
}

function authedFetch(path, options = {}) {
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Cookie: cookies,
      "Content-Type": "application/json",
    },
    redirect: "manual",
  });
}

test("Knowledge base API", async (t) => {
  await login();

  const noteResponse = await authedFetch("/api/notes", {
    method: "POST",
    body: JSON.stringify({ title: "Knowledge import source" }),
  });
  assert.equal(noteResponse.status, 201);
  const note = await noteResponse.json();

  const baseResponse = await authedFetch("/api/knowledge-bases", {
    method: "POST",
    body: JSON.stringify({ title: "Integration knowledge base" }),
  });
  assert.equal(baseResponse.status, 201);
  const base = await baseResponse.json();

  const folderResponse = await authedFetch(`/api/knowledge-bases/${base.id}/folders`, {
    method: "POST",
    body: JSON.stringify({ name: "Integration folder" }),
  });
  assert.equal(folderResponse.status, 201);
  const folder = await folderResponse.json();

  await t.test("imports owned content into an owned folder", async () => {
    const response = await authedFetch(`/api/knowledge-bases/${base.id}/items/import`, {
      method: "POST",
      body: JSON.stringify({
        folderId: folder.id,
        items: [{ kind: "note", noteId: note.id }],
      }),
    });

    assert.equal(response.status, 201);
    const items = await response.json();
    assert.equal(items.length, 1);
  });

  await t.test("lists the imported content at the target folder", async () => {
    const response = await authedFetch(
      `/api/knowledge-bases/${base.id}/contents?folderId=${folder.id}`,
    );
    assert.equal(response.status, 200);
    const items = await response.json();
    assert.ok(items.some((item) => item.note?.id === note.id));
  });

  await t.test("rejects a duplicate at the same target", async () => {
    const response = await authedFetch(`/api/knowledge-bases/${base.id}/items/import`, {
      method: "POST",
      body: JSON.stringify({
        folderId: folder.id,
        items: [{ kind: "note", noteId: note.id }],
      }),
    });
    assert.equal(response.status, 409);
  });

  await t.test("does not reveal invalid source or folder ownership", async () => {
    const invalidFolder = await authedFetch(`/api/knowledge-bases/${base.id}/items/import`, {
      method: "POST",
      body: JSON.stringify({
        folderId: "folder-from-another-account",
        items: [{ kind: "note", noteId: note.id }],
      }),
    });
    assert.equal(invalidFolder.status, 404);

    const invalidSource = await authedFetch(`/api/knowledge-bases/${base.id}/items/import`, {
      method: "POST",
      body: JSON.stringify({
        items: [{ kind: "note", noteId: "note-from-another-account" }],
      }),
    });
    assert.equal(invalidSource.status, 404);
  });

  await t.test("rejects unauthenticated imports", async () => {
    const response = await fetch(`${BASE}/api/knowledge-bases/${base.id}/items/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ kind: "note", noteId: note.id }] }),
      redirect: "manual",
    });
    assert.equal(response.status, 401);
  });
});
