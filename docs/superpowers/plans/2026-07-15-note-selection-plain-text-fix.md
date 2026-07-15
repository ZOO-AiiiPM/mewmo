# Note Selection Plain-Text Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ordinary note selection copy expose visible text in `text/plain` while retaining ProseMirror's rendered rich `text/html` and leaving `复制全文` Markdown-only.

**Architecture:** Add a pure ProseMirror `Slice` serializer that uses selected node text rather than Milkdown's Markdown serializer. Configure it through Crepe's direct `editorViewOptionsCtx.clipboardTextSerializer`, which takes precedence over the clipboard plugin without installing a DOM `onCopy` handler or replacing the HTML serializer.

**Tech Stack:** React 19, TypeScript 6, Milkdown/Crepe 7.21, ProseMirror 1.25, Vitest 4, Node test runner.

---

### Task 1: Serialize selected ProseMirror content as visible text

**Files:**
- Create: `apps/web/src/components/editor/note-selection-copy.ts`
- Create: `apps/web/src/components/editor/note-selection-copy.test.ts`

- [ ] **Step 1: Write failing serializer tests**

Create `apps/web/src/components/editor/note-selection-copy.test.ts` with a real ProseMirror schema and slices:

```ts
import { describe, expect, it } from "vitest";
import { Fragment, Schema, Slice } from "@milkdown/kit/prose/model";

import { serializeNoteSelectionText } from "./note-selection-copy";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    heading: { group: "block", content: "inline*" },
    text: { group: "inline" },
    hardbreak: {
      group: "inline",
      inline: true,
      leafText: () => "\n",
    },
    html: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: { value: { default: "" } },
    },
  },
  marks: { strong: {} },
});

function slice(...nodes: Parameters<typeof Fragment.fromArray>[0]) {
  return new Slice(Fragment.fromArray(nodes), 0, 0);
}

describe("note selection plain-text serializer", () => {
  it("copies heading and emphasized content without markdown markers", () => {
    const strong = schema.marks.strong!.create();
    expect(
      serializeNoteSelectionText(
        slice(
          schema.nodes.heading!.create(null, schema.text("标题")),
          schema.nodes.paragraph!.create(null, [
            schema.text("这是"),
            schema.text("重点", [strong]),
          ]),
        ),
      ),
    ).toBe("标题\n\n这是重点");
  });

  it("keeps real breaks while suppressing raw html source", () => {
    expect(
      serializeNoteSelectionText(
        slice(
          schema.nodes.paragraph!.create(null, [
            schema.text("第一行"),
            schema.nodes.hardbreak!.create(),
            schema.text("第二行"),
            schema.nodes.html!.create({ value: "<br />" }),
            schema.text("第三行"),
            schema.nodes.html!.create({ value: "<mark>raw</mark>" }),
          ]),
        ),
      ),
    ).toBe("第一行\n第二行\n第三行");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm vitest run apps/web/src/components/editor/note-selection-copy.test.ts
```

Expected: FAIL because `./note-selection-copy` does not exist.

- [ ] **Step 3: Implement the visible-text serializer**

Create `apps/web/src/components/editor/note-selection-copy.ts`:

```ts
import type { Node as ProseMirrorNode, Slice } from "@milkdown/kit/prose/model";

const HTML_BREAK_RE = /^\s*<br\s*\/?>\s*$/i;

function visibleLeafText(node: ProseMirrorNode) {
  if (node.type.name === "html") {
    const value = typeof node.attrs.value === "string" ? node.attrs.value : "";
    return HTML_BREAK_RE.test(value) ? "\n" : "";
  }
  return node.type.spec.leafText?.(node) ?? "";
}

export function serializeNoteSelectionText(slice: Slice) {
  return slice.content.textBetween(
    0,
    slice.content.size,
    "\n\n",
    visibleLeafText,
  );
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run:

```bash
pnpm vitest run apps/web/src/components/editor/note-selection-copy.test.ts apps/web/src/lib/note-markdown-breaks.test.ts
```

Expected: both test files pass and the legacy-break normalizer remains covered.

- [ ] **Step 5: Stage and commit Task 1**

```bash
git add apps/web/src/components/editor/note-selection-copy.ts apps/web/src/components/editor/note-selection-copy.test.ts
git commit -m "fix(editor): serialize note selection as visible text"
```

### Task 2: Override Milkdown's Markdown plain-text serializer

**Files:**
- Modify: `apps/web/src/components/editor/NoteEditor.tsx`
- Modify: `tests/unit/note-editor-native-copy.test.mjs`

- [ ] **Step 1: Write a failing editor integration contract test**

Extend `tests/unit/note-editor-native-copy.test.mjs`:

```js
test("note editor overrides only Milkdown plain-text copy serialization", () => {
  assert.match(source, /editorViewOptionsCtx/);
  assert.match(source, /clipboardTextSerializer:\s*serializeNoteSelectionText/);
  assert.doesNotMatch(source, /clipboardSerializer\s*:/);
  assert.doesNotMatch(source, /onCopy\s*=/);
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
node --test tests/unit/note-editor-native-copy.test.mjs
```

Expected: FAIL because `NoteEditor` does not yet configure `editorViewOptionsCtx` or `serializeNoteSelectionText`.

- [ ] **Step 3: Configure the direct editor view option**

In `NoteEditor.tsx`, add:

```ts
import { editorViewOptionsCtx } from "@milkdown/kit/core";
import { serializeNoteSelectionText } from "./note-selection-copy";
```

After constructing `crepe` and before returning it, add:

```ts
crepe.editor.config((ctx) => {
  ctx.update(editorViewOptionsCtx, (options) => ({
    ...options,
    clipboardTextSerializer: serializeNoteSelectionText,
  }));
});
```

Do not add `onCopy`, `handleDOMEvents.copy`, `clipboardSerializer`, `ClipboardItem`, or clipboard writes. Those would take ownership away from ProseMirror or change the rich HTML channel.

- [ ] **Step 4: Run integration and focused regression tests**

Run:

```bash
node --test tests/unit/note-editor-native-copy.test.mjs tests/unit/note-copy-ui.test.mjs
pnpm vitest run apps/web/src/components/editor/note-selection-copy.test.ts apps/web/src/lib/note-markdown-breaks.test.ts apps/web/src/lib/note-copy.test.ts tests/unit/editor-markdown-save.test.ts
```

Expected: all selected Node and Vitest tests pass.

- [ ] **Step 5: Stage and commit Task 2**

```bash
git add apps/web/src/components/editor/NoteEditor.tsx tests/unit/note-editor-native-copy.test.mjs
git commit -m "fix(editor): keep selected-note plain text rendered"
```

### Task 3: Verify clipboard representations and hand off

**Files:**
- Modify: `docs/superpowers/plans/2026-07-15-note-selection-plain-text-fix.md`

- [ ] **Step 1: Run automated verification**

Run:

```bash
pnpm --filter @mewmo/web lint
pnpm --filter @mewmo/web build
pnpm test:theme
pnpm test:unit
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Run browser clipboard verification**

On `http://localhost:3017`, select a rendered note containing a heading, strong text, paragraphs, a hard break, and legacy `<br />` source. Verify:

1. `Cmd/Ctrl+C` writes both `text/plain` and `text/html`.
2. `text/plain` contains visible text and line breaks but no Markdown markers or literal `<br>` variants.
3. `text/html` retains rendered heading, strong, paragraph, and break elements without displaying raw tags as text.
4. `复制全文` still writes one Markdown-only `text/plain` entry.

- [ ] **Step 3: Request review and resolve findings**

Use `requesting-code-review` with base `b1cb010` and final implementation SHA. Resolve every Critical or Important finding, rerun affected evidence, and record any unavailable browser destination without claiming it passed.

- [ ] **Step 4: Add a new Linear comment without changing history**

Add one Chinese completion comment to ZOO-27 referencing the revised contract and new commits. Do not edit or delete prior comments, and keep the issue `In Progress` pending explicit user acceptance. If the Linear tool is still unavailable, record the connection blocker instead of claiming the comment exists.

- [ ] **Step 5: Commit verification bookkeeping**

Check only completed items, then:

```bash
git add docs/superpowers/plans/2026-07-15-note-selection-plain-text-fix.md
git commit -m "docs: record visible selection copy verification"
```
