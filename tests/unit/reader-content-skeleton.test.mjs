import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("clip and note detail loading use breath skeleton instead of spinner", () => {
  const clipRenderer = read("apps/web/src/components/clips/ClipContentRenderer.tsx");
  const notePage = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  const todayPage = read("apps/web/src/app/(app)/today/page.tsx");
  const knowledgePage = read("apps/web/src/app/(app)/knowledge-bases/page.tsx");
  const skeleton = read("apps/web/src/components/shell/ReaderContentSkeleton.tsx");
  const listSkeleton = read("apps/web/src/components/shell/ListContentSkeleton.tsx");
  const css = read("apps/web/src/app/globals.css");
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");

  assert.match(clipRenderer, /ReaderContentSkeleton/);
  assert.doesNotMatch(clipRenderer, /mewmo-spinner|useSkeletonGate|progress=/);
  assert.match(notePage, /ReaderContentSkeleton/);
  assert.match(notePage, /ListContentSkeleton/);
  assert.match(todayPage, /ListContentSkeleton/);
  assert.match(todayPage, /ReaderContentSkeleton/);
  assert.match(knowledgePage, /ListContentSkeleton/);
  assert.match(knowledgePage, /ReaderContentSkeleton/);
  assert.doesNotMatch(skeleton, /progress/);
  assert.doesNotMatch(listSkeleton, /progress/);
  assert.match(listSkeleton, /variant/);
  assert.match(listSkeleton, /"media"|"mixed"|"text"/);
  assert.match(css, /@keyframes mewmo-skeleton-breath/);
  assert.match(css, /\.mewmo-skeleton-block[\s\S]*mewmo-skeleton-breath/);
  assert.match(css, /filter:\s*brightness/);
  assert.doesNotMatch(css, /\.mewmo-skeleton-block[\s\S]{0,220}opacity:/);
  assert.doesNotMatch(
    css,
    /mewmo-skeleton-sweep|mewmo-skeleton-shimmer|mewmo-skeleton-extend|mewmo-route-skeleton-sweep|mewmo-reader-content-enter/,
  );
  assert.match(css, /\.mewmo-reader-content-skeleton__media/);
  assert.match(css, /\.mewmo-list-content-skeleton__cover/);
  assert.match(css, /\.mewmo-list-content-skeleton__thumbs/);
  assert.match(css, /\.mewmo-list-content-skeleton__preview/);
  assert.match(css, /\.mewmo-list-content-skeleton__meta-row/);
  assert.match(css, /\.mewmo-list-content-skeleton__card[\s\S]{0,120}border:\s*0/);
  assert.match(css, /\.mewmo-reader-content-skeleton[\s\S]{0,180}min-height:\s*calc\(100vh/);
  assert.match(listSkeleton, /mewmo-list-content-skeleton__preview/);
  assert.match(listSkeleton, /mewmo-list-content-skeleton__meta-row/);
  assert.match(skeleton, /mewmo-reader-content-skeleton__meta-row/);
  assert.match(feedsPage, /variant="media"/);
  assert.match(todayPage, /variant="mixed"/);
  assert.match(knowledgePage, /variant="mixed"/);
  assert.match(notePage, /variant="text"/);
  assert.doesNotMatch(todayPage, /useSkeletonGate|listGate/);
  assert.doesNotMatch(feedsPage, /useSkeletonGate|feedLoadGate/);
});
