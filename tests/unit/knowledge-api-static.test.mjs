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
  assert.match(route, /产品设计/, "prototype default knowledge base should be seeded");
  assert.match(route, /技术笔记/, "prototype default knowledge base should be seeded");
  assert.match(route, /竞品分析/, "prototype product folder tree should be seeded");
  assert.match(route, /pgvector/, "prototype tech folder tree should be seeded");
  assert.match(route, /seedPrototypeKnowledgeItems/, "prototype default mixed content should be seeded as real items");
  assert.match(route, /createNotesRepository/, "prototype note cards should be backed by real notes");
  assert.match(route, /createClipsRepository/, "prototype clipped cards should be backed by real clips");
  assert.match(route, /产品定位：一只猫的陪伴感从哪来/, "prototype note item should be seeded");
  assert.match(route, /把信息管家做成陪伴：可爱的反义词不是严肃/, "prototype article clip item should be seeded");
  assert.match(route, /Figma 如何做产品决策/, "prototype video clip item should be seeded");
  assert.match(route, /Design Systems Handbook/, "prototype PDF asset item should be seeded");
  assert.match(route, /About Face：交互设计精髓/, "prototype ebook asset item should be seeded");
});
