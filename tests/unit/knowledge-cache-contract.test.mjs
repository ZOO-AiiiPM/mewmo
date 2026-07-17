import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const page = read("apps/web/src/app/(app)/knowledge-bases/page.tsx");
const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
const repository = read("packages/db/src/repositories/knowledge-bases.ts");

test("knowledge list projections omit note clip and feed bodies", () => {
  assert.doesNotMatch(repository, /note:\s*true|clip:\s*true/);
  assert.doesNotMatch(repository, /content:\s*true/);
  assert.match(repository, /note:\s*\{\s*select:/);
  assert.match(repository, /clip:\s*\{\s*select:/);
  assert.match(repository, /feedEntry:\s*\{\s*select:/);
});

test("sidebar and page share knowledge base and tree resources", () => {
  for (const source of [sidebar, page]) {
    assert.match(source, /workspaceResourceKeys\.knowledgeBases\(\)/);
    assert.match(source, /loadWorkspaceResource|refreshWorkspaceResource|useWorkspaceResource/);
  }
  assert.match(sidebar, /workspaceResourceKeys\.knowledgeTree\(base\.id\)/);
  assert.match(page, /workspaceResourceKeys\.knowledgeTree\(kbId\)/);
});

test("knowledge folder contents and selected bodies use canonical resources", () => {
  assert.match(page, /workspaceResourceKeys\.knowledgeContents\(kbId, folderId\)/);
  assert.match(page, /useWorkspaceResource/);
  assert.match(page, /workspaceResourceKeys\.(noteDetail|clipDetail|feedEntryDetail)/);
  assert.match(page, /updateSelectedDetail/);
  assert.doesNotMatch(page, /note:\s*\{\s*\.\.\.item\.note,\s*content/);
});
