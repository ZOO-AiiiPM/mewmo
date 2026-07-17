import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const routePath = "apps/web/src/app/api/knowledge-bases/[[...parts]]/route.ts";

test("knowledge base API route uses shared validators and db repository boundaries", () => {
  assert.ok(existsSync(routePath), "knowledge base catch-all API route should exist");

  const route = readFileSync(routePath, "utf8");

  for (const validator of [
    "createKnowledgeBaseSchema",
    "updateKnowledgeBaseSchema",
    "createKnowledgeFolderSchema",
    "updateKnowledgeFolderSchema",
    "importKnowledgeItemsSchema",
    "createKnowledgeAssetSchema",
  ]) {
    assert.match(route, new RegExp(validator), `${validator} should validate route input`);
  }

  assert.match(
    route,
    /createKnowledgeBasesRepository/,
    "API route should go through the db repository instead of ad hoc Prisma calls",
  );
  assert.match(route, /KnowledgeFolderDepthError/, "API route should translate max-depth errors");
  assert.match(route, /return NextResponse\.json\(await repo\.findByUserId\(userId\)\)/);
  const repository = readFileSync("packages/db/src/repositories/knowledge-bases.ts", "utf8");
  assert.doesNotMatch(repository, /note:\s*true|clip:\s*true/);
  assert.doesNotMatch(repository, /content:\s*true/);
  assert.doesNotMatch(
    route,
    /PROTOTYPE_KNOWLEDGE_BASES|PROTOTYPE_KNOWLEDGE_ITEMS|seedPrototype|removeLegacyPrototypeContent|createNotesRepository|createClipsRepository/,
    "reading knowledge bases must not create or clean up workspace content",
  );
});
