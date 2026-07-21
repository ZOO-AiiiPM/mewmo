import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("clip and note detail loading use a horizontal AI-style sweep instead of spinner", () => {
  const clipRenderer = read("apps/web/src/components/clips/ClipContentRenderer.tsx");
  const notePage = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  const todayPage = read("apps/web/src/app/(app)/today/page.tsx");
  const knowledgePage = read("apps/web/src/app/(app)/knowledge-bases/page.tsx");
  const skeleton = read("apps/web/src/components/shell/ReaderContentSkeleton.tsx");
  const listSkeleton = read("apps/web/src/components/shell/ListContentSkeleton.tsx");
  const css = read("apps/web/src/app/globals.css");
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const trashPage = read("apps/web/src/app/(app)/trash/page.tsx");

  assert.match(clipRenderer, /ReaderContentSkeleton/);
  assert.match(clipRenderer, /showTitle=\{false\}/);
  assert.doesNotMatch(clipRenderer, /mewmo-spinner|useSkeletonGate|progress=/);
  assert.match(notePage, /ReaderContentSkeleton/);
  assert.match(notePage, /ListContentSkeleton/);
  assert.match(todayPage, /ListContentSkeleton/);
  assert.match(todayPage, /ReaderContentSkeleton/);
  assert.match(todayPage, /initialLoading:\s*selectedDetailLoading/);
  assert.match(todayPage, /selectedDetailLoading\s*\?/);
  assert.match(knowledgePage, /ListContentSkeleton/);
  assert.match(knowledgePage, /ReaderContentSkeleton/);
  assert.match(knowledgePage, /if \(!loading\)[\s\S]*暂无正文内容/);
  assert.doesNotMatch(skeleton, /progress/);
  assert.doesNotMatch(listSkeleton, /progress/);
  assert.match(listSkeleton, /variant/);
  assert.match(listSkeleton, /"media"|"mixed"|"text"/);
  assert.match(css, /@keyframes mewmo-skeleton-sweep/);
  assert.match(css, /\.mewmo-skeleton-block::after[\s\S]*mewmo-skeleton-sweep/);
  assert.match(css, /linear-gradient\([\s\S]*90deg/);
  assert.match(css, /translate3d\(260%, 0, 0\)/);
  assert.doesNotMatch(css, /filter:\s*brightness/);
  assert.match(css, /--skeleton-base:[\s\S]*background:\s*var\(--skeleton-base\)/);
  assert.doesNotMatch(
    css,
    /mewmo-skeleton-breath|mewmo-skeleton-shimmer|mewmo-skeleton-extend|mewmo-route-skeleton-sweep|mewmo-reader-content-enter/,
  );
  assert.match(css, /\.mewmo-reader-content-skeleton__media/);
  assert.match(listSkeleton, /mewmo-list-card__cover/);
  assert.match(listSkeleton, /mewmo-list-card__thumbs/);
  assert.match(listSkeleton, /mewmo-list-card-skeleton__preview/);
  assert.match(listSkeleton, /mewmo-list-card-skeleton__meta/);
  assert.match(listSkeleton, /mewmo-list-card mewmo-list-card--skeleton/);
  assert.match(css, /\.mewmo-reader-content-skeleton[\s\S]{0,180}min-height:\s*calc\(100vh/);
  assert.match(skeleton, /mewmo-reader-content-skeleton__meta-row/);
  assert.match(feedsPage, /variant="media"/);
  assert.match(todayPage, /variant="mixed"/);
  assert.match(trashPage, /variant="mixed"/);
  assert.match(knowledgePage, /variant="mixed"/);
  assert.match(notePage, /variant="text"/);
  assert.doesNotMatch(todayPage, /useSkeletonGate|listGate/);
  assert.doesNotMatch(feedsPage, /useSkeletonGate|feedLoadGate/);
});
