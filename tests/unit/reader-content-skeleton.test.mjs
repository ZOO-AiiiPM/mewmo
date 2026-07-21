import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("clip and note detail loading use deferred skeleton instead of spinner", () => {
  const clipRenderer = read("apps/web/src/components/clips/ClipContentRenderer.tsx");
  const notePage = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  const todayPage = read("apps/web/src/app/(app)/today/page.tsx");
  const knowledgePage = read("apps/web/src/app/(app)/knowledge-bases/page.tsx");
  const skeleton = read("apps/web/src/components/shell/ReaderContentSkeleton.tsx");
  const listSkeleton = read("apps/web/src/components/shell/ListContentSkeleton.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(clipRenderer, /ReaderContentSkeleton/);
  assert.match(clipRenderer, /useSkeletonGate/);
  assert.doesNotMatch(clipRenderer, /mewmo-spinner/);
  assert.match(notePage, /ReaderContentSkeleton/);
  assert.match(notePage, /ListContentSkeleton/);
  assert.match(todayPage, /ListContentSkeleton/);
  assert.match(todayPage, /ReaderContentSkeleton/);
  assert.match(knowledgePage, /ListContentSkeleton/);
  assert.match(knowledgePage, /ReaderContentSkeleton/);
  assert.match(skeleton, /progress/);
  assert.match(listSkeleton, /progress/);
  assert.match(listSkeleton, /variant/);
  assert.match(listSkeleton, /"media"|"mixed"|"text"/);
  assert.doesNotMatch(clipRenderer, /mewmo-reader-content-enter/);
  assert.match(css, /\.mewmo-skeleton-sweep/);
  assert.doesNotMatch(css, /mewmo-skeleton-breath|mewmo-skeleton-shimmer|mewmo-reader-content-enter/);
  assert.match(css, /\.mewmo-reader-content-skeleton__media/);
  assert.match(css, /\.mewmo-list-content-skeleton__cover/);
  assert.match(css, /\.mewmo-list-content-skeleton__thumbs/);

  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  assert.match(feedsPage, /feedLoadGate/);
  assert.match(feedsPage, /ReaderContentSkeleton/);
  assert.match(feedsPage, /variant="media"/);
  assert.match(todayPage, /variant="mixed"/);
  assert.match(knowledgePage, /variant="mixed"/);
  assert.match(notePage, /variant="text"/);
});
