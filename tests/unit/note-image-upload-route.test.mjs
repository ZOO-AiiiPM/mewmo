import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "apps/web/src/app/api/uploads/note-image/route.ts",
  "utf8",
);

test("note image upload route requires auth and note ownership", () => {
  assert.match(source, /const session = await auth\(\)/);
  assert.match(source, /if \(!session\?\.user\?\.id\)/);
  assert.match(source, /where:\s*\{\s*id:\s*noteId,\s*userId:\s*session\.user\.id,\s*deletedAt:\s*null/s);
});

test("note image upload route stores images through the R2 helper", () => {
  assert.match(source, /formData\.get\("noteId"\)/);
  assert.match(source, /formData\.get\("file"\)/);
  assert.match(source, /file instanceof File/);
  assert.match(source, /uploadNoteImageFile\(\{[\s\S]*noteId,[\s\S]*file,[\s\S]*upload/);
});
