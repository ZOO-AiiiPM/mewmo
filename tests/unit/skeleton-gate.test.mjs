import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("skeleton gate is single-pass and progress-driven", () => {
  const gate = read("apps/web/src/lib/use-skeleton-gate.ts");
  const css = read("apps/web/src/app/globals.css");
  const list = read("apps/web/src/components/shell/ListContentSkeleton.tsx");
  const reader = read("apps/web/src/components/shell/ReaderContentSkeleton.tsx");
  const today = read("apps/web/src/app/(app)/today/page.tsx");
  const knowledge = read("apps/web/src/app/(app)/knowledge-bases/page.tsx");
  const feeds = read("apps/web/src/app/(app)/feeds/page.tsx");

  assert.match(gate, /useSkeletonGate/);
  assert.match(gate, /LOADING_CAP/);
  assert.match(gate, /finishing/);
  assert.doesNotMatch(
    css,
    /\.mewmo-skeleton-block[\s\S]{0,200}infinite|mewmo-skeleton-breath|mewmo-skeleton-shimmer/,
  );
  assert.match(css, /\.mewmo-skeleton-sweep/);
  assert.match(css, /--skeleton-p/);
  assert.match(list, /progress/);
  assert.match(list, /mewmo-skeleton-sweep/);
  assert.match(reader, /progress/);
  assert.match(reader, /mewmo-skeleton-sweep/);
  assert.match(today, /useSkeletonGate/);
  assert.match(today, /progress=\{listGate\.progress\}/);
  assert.match(knowledge, /useSkeletonGate/);
  assert.match(feeds, /feedLoadGate/);
});
