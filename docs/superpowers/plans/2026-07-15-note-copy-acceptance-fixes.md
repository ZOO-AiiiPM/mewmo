# Note Copy Acceptance Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `复制全文` a Markdown-only action across Notes, Today, and knowledge bases while preserving browser-native editor selection copy without literal legacy `<br>` source or accumulated blank lines.

**Architecture:** A new pure `note-markdown-breaks` module normalizes legacy break tags into stable Markdown paragraph or hard-break syntax while preserving fenced code. `note-copy` becomes a small Markdown builder plus `writeText` adapter. `NoteEditor` feeds normalized Markdown to Crepe so ordinary selection copy remains browser-native, and all three note reader surfaces provide their current local note state to the shared copy action.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Milkdown/Crepe 7, Clipboard API `writeText`, Vitest 4, Node test runner.

---

### Task 1: Normalize legacy break tags without damaging code

**Files:**
- Create: `apps/web/src/lib/note-markdown-breaks.ts`
- Create: `apps/web/src/lib/note-markdown-breaks.test.ts`

- [x] **Step 1: Write failing break-normalization tests**

Create `apps/web/src/lib/note-markdown-breaks.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { normalizeNoteMarkdownBreaks } from "./note-markdown-breaks";

describe("note markdown break normalization", () => {
  it("collapses a standalone legacy break and adjacent blanks to one paragraph boundary", () => {
    expect(
      normalizeNoteMarkdownBreaks("测试\n\n<br />\n\n\n测试中"),
    ).toBe("测试\n\n测试中");
  });

  it("turns inline legacy breaks into markdown hard breaks", () => {
    expect(
      normalizeNoteMarkdownBreaks("第一行<br>第二行<br/>第三行"),
    ).toBe("第一行  \n第二行  \n第三行");
  });

  it("preserves break-like text inside fenced code", () => {
    expect(
      normalizeNoteMarkdownBreaks("```html\n<br />\n```\n\n正文<br />下一行"),
    ).toBe("```html\n<br />\n```\n\n正文  \n下一行");
  });
});
```

- [x] **Step 2: Run the tests and verify RED**

Run:

```bash
pnpm vitest run apps/web/src/lib/note-markdown-breaks.test.ts
```

Expected: FAIL because `./note-markdown-breaks` does not exist.

- [x] **Step 3: Implement the pure normalizer**

Create `apps/web/src/lib/note-markdown-breaks.ts`:

```ts
const INLINE_BREAK_RE = /<br\s*\/?>/gi;
const STANDALONE_BREAK_RE = /^\s*<br\s*\/?>\s*$/i;
const FENCE_RE = /^\s*(```|~~~)/;

export function normalizeNoteMarkdownBreaks(markdown: string) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const normalized: string[] = [];
  let fenceMarker: "```" | "~~~" | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const fence = line.match(FENCE_RE)?.[1] as "```" | "~~~" | undefined;
    if (fence) {
      if (!fenceMarker) fenceMarker = fence;
      else if (fenceMarker === fence) fenceMarker = null;
      normalized.push(line);
      continue;
    }

    if (fenceMarker) {
      normalized.push(line);
      continue;
    }

    if (STANDALONE_BREAK_RE.test(line)) {
      while (normalized.at(-1)?.trim() === "") normalized.pop();
      let nextIndex = index + 1;
      while (nextIndex < lines.length && !(lines[nextIndex] ?? "").trim()) {
        nextIndex += 1;
      }
      if (normalized.length > 0 && nextIndex < lines.length) normalized.push("");
      index = nextIndex - 1;
      continue;
    }

    normalized.push(line.replace(INLINE_BREAK_RE, "  \n"));
  }

  return normalized.join("\n");
}
```

- [x] **Step 4: Run the tests and verify GREEN**

Run:

```bash
pnpm vitest run apps/web/src/lib/note-markdown-breaks.test.ts
```

Expected: 3 tests pass.

- [x] **Step 5: Stage and commit Task 1**

```bash
git add apps/web/src/lib/note-markdown-breaks.ts apps/web/src/lib/note-markdown-breaks.test.ts
git commit -m "fix(notes): normalize legacy markdown breaks"
```

### Task 2: Make copy-full Markdown-only

**Files:**
- Modify: `apps/web/src/lib/note-copy.ts`
- Modify: `apps/web/src/lib/note-copy.test.ts`
- Reuse: `apps/web/src/lib/note-markdown-breaks.ts`

- [x] **Step 1: Replace the old dual-format tests with the revised contract**

Rewrite `apps/web/src/lib/note-copy.test.ts` around these public functions:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  buildNoteCopyMarkdown,
  copyNoteMarkdownToClipboard,
} from "./note-copy";

describe("note copy markdown", () => {
  it("copies one title and stable paragraph spacing", () => {
    expect(
      buildNoteCopyMarkdown({
        title: "你好",
        markdown: "测试\n\n<br />\n\n\n测试中",
      }),
    ).toBe("# 你好\n\n测试\n\n测试中");
  });

  it("keeps markdown syntax and converts inline breaks to hard breaks", () => {
    expect(
      buildNoteCopyMarkdown({
        title: "格式测试",
        markdown: "正文含 **重点**<br>下一行",
      }),
    ).toBe("# 格式测试\n\n正文含 **重点**  \n下一行");
  });

  it("copies an empty note title", () => {
    expect(buildNoteCopyMarkdown({ title: "空笔记", markdown: "" })).toBe(
      "# 空笔记",
    );
  });
});

describe("note markdown clipboard writer", () => {
  it("uses writeText only", async () => {
    const write = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    const clipboard = { write, writeText };

    await copyNoteMarkdownToClipboard("# 标题", clipboard);

    expect(writeText).toHaveBeenCalledWith("# 标题");
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects clipboard failures", async () => {
    await expect(
      copyNoteMarkdownToClipboard("# 标题", {
        writeText: async () => {
          throw new Error("denied");
        },
      }),
    ).rejects.toThrow("denied");
  });
});
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm vitest run apps/web/src/lib/note-copy.test.ts
```

Expected: FAIL because the revised public functions are not exported and the current writer still writes HTML.

- [x] **Step 3: Replace dual-format serialization with Markdown-only copying**

Replace `apps/web/src/lib/note-copy.ts` with:

```ts
import { normalizeNoteMarkdownBreaks } from "./note-markdown-breaks";

export interface NoteTextClipboard {
  writeText: (text: string) => Promise<void>;
}

export function buildNoteCopyMarkdown({
  title,
  markdown,
}: {
  title: string;
  markdown: string;
}) {
  const normalizedTitle = title.trim() || "Untitled";
  const normalizedMarkdown = normalizeNoteMarkdownBreaks(markdown).trim();
  return [`# ${normalizedTitle}`, normalizedMarkdown].filter(Boolean).join("\n\n");
}

export async function copyNoteMarkdownToClipboard(
  markdown: string,
  clipboard: NoteTextClipboard | undefined,
) {
  if (!clipboard) throw new Error("Clipboard is unavailable");
  await clipboard.writeText(markdown);
}
```

Remove the old HTML block/inline serializer, `ClipboardItem`, `Blob`, and multi-format fallback code.

- [x] **Step 4: Run the revised test and verify GREEN**

Run:

```bash
pnpm vitest run apps/web/src/lib/note-copy.test.ts apps/web/src/lib/note-markdown-breaks.test.ts
```

Expected: 8 tests pass.

- [x] **Step 5: Stage and commit Task 2**

```bash
git add apps/web/src/lib/note-copy.ts apps/web/src/lib/note-copy.test.ts
git commit -m "fix(notes): copy full notes as markdown only"
```

### Task 3: Feed normalized Markdown to Crepe and keep native copy

**Files:**
- Modify: `apps/web/src/components/editor/NoteEditor.tsx`
- Create: `tests/unit/note-editor-native-copy.test.mjs`

- [x] **Step 1: Write a failing editor contract test**

Create `tests/unit/note-editor-native-copy.test.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "apps/web/src/components/editor/NoteEditor.tsx",
  "utf8",
);

test("note editor normalizes legacy breaks before Crepe initialization", () => {
  assert.match(source, /normalizeNoteMarkdownBreaks/);
  assert.match(
    source,
    /normalizeNoteMarkdownBreaks\(\s*resolveInitialNoteContent\(/,
  );
});

test("note editor leaves selection copy to the browser", () => {
  assert.doesNotMatch(source, /onCopy\s*=|handleCopy|clipboardData\.setData/);
});
```

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
node --test tests/unit/note-editor-native-copy.test.mjs
```

Expected: the normalization assertion fails because `NoteEditor` passes legacy Markdown directly to Crepe.

- [x] **Step 3: Normalize the resolved initial editor Markdown**

In `NoteEditor.tsx`, import:

```ts
import { normalizeNoteMarkdownBreaks } from "../../lib/note-markdown-breaks";
```

Change the initial editor state to:

```ts
const [editorInitialContent] = useState(() =>
  normalizeNoteMarkdownBreaks(
    resolveInitialNoteContent(initialContent, readNoteContentDraft(noteId)),
  ),
);
```

Do not add an `onCopy` prop or ProseMirror clipboard serializer. The existing first `markdownUpdated` guard continues to prevent opening a non-empty note from triggering an autosave.

- [x] **Step 4: Run editor and normalization tests**

Run:

```bash
node --test tests/unit/note-editor-native-copy.test.mjs
pnpm vitest run apps/web/src/lib/note-markdown-breaks.test.ts tests/unit/editor-markdown-save.test.ts
```

Expected: 2 Node tests and all selected Vitest tests pass.

- [x] **Step 5: Stage and commit Task 3**

```bash
git add apps/web/src/components/editor/NoteEditor.tsx tests/unit/note-editor-native-copy.test.mjs
git commit -m "fix(editor): render legacy breaks as native structure"
```

### Task 4: Wire copy-full into all note reader surfaces

**Files:**
- Modify: `apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx`
- Modify: `apps/web/src/app/(app)/today/page.tsx`
- Modify: `apps/web/src/app/(app)/knowledge-bases/page.tsx`
- Modify: `tests/unit/note-copy-ui.test.mjs`

- [x] **Step 1: Write failing UI contract assertions for all three surfaces**

Extend `tests/unit/note-copy-ui.test.mjs` to assert:

```js
test("all note reader surfaces copy current local markdown", () => {
  const notes = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  const today = read("apps/web/src/app/(app)/today/page.tsx");
  const knowledge = read("apps/web/src/app/(app)/knowledge-bases/page.tsx");

  for (const source of [notes, today, knowledge]) {
    assert.match(source, /buildNoteCopyMarkdown\(/);
    assert.match(source, /copyNoteMarkdownToClipboard\(/);
    assert.match(source, /showToast\("已复制全文", "success"\)/);
    assert.match(source, /showToast\("复制全文失败", "error"\)/);
    assert.match(source, /onCopyContent=/);
  }

  assert.match(today, /selected\?\.type === "note"/);
  assert.match(knowledge, /selectedItem\?\.kind === "note"/);
});
```

Update the existing Notes assertion to use `buildNoteCopyMarkdown` and retain the checks for current `selectedNote.title` plus the loaded `selectedNote.content`. The action must stay unavailable while `content` is still `undefined`, so a fast selection change cannot pair the new title with the previous note body.

- [x] **Step 2: Run the UI contract test and verify RED**

Run:

```bash
node --test tests/unit/note-copy-ui.test.mjs
```

Expected: FAIL because Today and knowledge bases do not provide `onCopyContent`, and Notes still calls the dual-format API.

- [x] **Step 3: Update the main Notes handler**

In `NoteEditorPage.tsx`, import `buildNoteCopyMarkdown` and `copyNoteMarkdownToClipboard`. Replace `copyCurrentNote` with:

```ts
const copyCurrentNote = async () => {
  if (!selectedNote || selectedNote.content === undefined) return;
  try {
    const markdown = buildNoteCopyMarkdown({
      title: selectedNote.title,
      markdown: selectedNote.content,
    });
    await copyNoteMarkdownToClipboard(markdown, navigator.clipboard);
    showToast("已复制全文", "success");
  } catch {
    showToast("复制全文失败", "error");
  }
};
```

Pass `onCopyContent` only when `selectedNote?.content !== undefined`. The editor callback already writes current local Markdown into the selected note record, so a second `editorContent` state would create a cross-note stale-data window.

- [x] **Step 4: Add the Today note handler**

In `today/page.tsx`, import `useToast`, `buildNoteCopyMarkdown`, and `copyNoteMarkdownToClipboard`. Initialize `const { showToast } = useToast();` with the other hooks. Add:

```ts
const copySelectedNote = async () => {
  if (selected?.type !== "note") return;
  try {
    const markdown = buildNoteCopyMarkdown({
      title: selected.title,
      markdown: selected.content ?? "",
    });
    await copyNoteMarkdownToClipboard(markdown, navigator.clipboard);
    showToast("已复制全文", "success");
  } catch {
    showToast("复制全文失败", "error");
  }
};
```

Pass:

```tsx
onCopyContent={selected?.type === "note" ? () => void copySelectedNote() : undefined}
```

- [x] **Step 5: Add the knowledge-base note handler**

In `knowledge-bases/page.tsx`, reuse its existing `showToast` and import the revised copy functions. Add:

```ts
const copySelectedNote = async () => {
  if (selectedItem?.kind !== "note" || !selectedItem.note) return;
  try {
    const markdown = buildNoteCopyMarkdown({
      title: selectedItem.note.title,
      markdown: selectedItem.note.content ?? "",
    });
    await copyNoteMarkdownToClipboard(markdown, navigator.clipboard);
    showToast("已复制全文", "success");
  } catch {
    showToast("复制全文失败", "error");
  }
};
```

Pass:

```tsx
onCopyContent={
  selectedItem?.kind === "note" && selectedItem.note
    ? () => void copySelectedNote()
    : undefined
}
```

- [x] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
pnpm vitest run apps/web/src/lib/note-markdown-breaks.test.ts apps/web/src/lib/note-copy.test.ts
node --test tests/unit/note-editor-native-copy.test.mjs tests/unit/note-copy-ui.test.mjs
```

Expected: all focused Vitest and Node tests pass.

- [x] **Step 7: Stage and commit Task 4**

```bash
git add 'apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx' 'apps/web/src/app/(app)/today/page.tsx' 'apps/web/src/app/(app)/knowledge-bases/page.tsx' tests/unit/note-copy-ui.test.mjs
git commit -m "fix(notes): expose markdown copy across note readers"
```

### Task 5: Verify, review, and hand off revised acceptance

**Files:**
- Modify: `docs/superpowers/plans/2026-07-15-note-copy-acceptance-fixes.md`
- No production files beyond Tasks 1-4

- [x] **Step 1: Run change-scoped automated verification**

Run:

```bash
pnpm vitest run apps/web/src/lib/note-markdown-breaks.test.ts apps/web/src/lib/note-copy.test.ts tests/unit/editor-markdown-save.test.ts
node --test tests/unit/note-editor-native-copy.test.mjs tests/unit/note-copy-ui.test.mjs
pnpm --filter @mewmo/web lint
pnpm --filter @mewmo/web build
pnpm test:theme
pnpm test:unit
git diff --check
```

Expected: every command exits 0. Generate Prisma Client first if the isolated worktree does not contain generated types. Restore generated `apps/web/next-env.d.ts` noise before committing.

- [ ] **Step 2: Run browser verification**

Partial evidence on `http://localhost:3017`:

- Notes and Today each exposed exactly one `复制全文` action for a selected note.
- `复制全文` produced one `text/plain` entry with `# Untitled\n\n测试\n\n测试中\nUNSAVED-ZOO27-0715`, including the current local editor state.
- Native editor select-all produced `text/html` plus `text/plain`; the plain text contained no literal `<br>` variant.
- The Clips reader exposed no `复制全文` action.
- Dark-theme menu and toast were readable in the live browser.
- Knowledge-base note and non-note states were unavailable because the test account had no persisted knowledge-base item; light-theme switching was not completed. Keep this step unchecked until those states are verified.

On an isolated localhost port, verify:

1. Notes, Today note, and knowledge-base note each show exactly one `复制全文` action.
2. `复制全文` produces only `text/plain` with exact Markdown spacing and no `text/html` clipboard entry.
3. An unsaved local edit is included in `复制全文`.
4. Native partial selection and select-all copy contain no literal `<br>` variants.
5. Native paste into available rich and plain destinations shows rendered content rather than HTML source.
6. Clip, feed, Today non-note, and knowledge non-note readers do not show `复制全文`.
7. Menu and toast remain readable in light and dark themes.

- [x] **Step 3: Request code review and resolve findings**

Review of `01ce506..597923f` found two Important issues: Notes could briefly pair a newly selected title with stale `editorContent`, and fenced-code normalization did not track opening marker length. Both were fixed in `284f0b5` with RED/GREEN regression tests. Reviewer follow-up confirmed both findings resolved with no new Critical, Important, or Minor findings.

Use `requesting-code-review` with base `01ce506` and the final implementation SHA. Fix every Critical or Important finding and rerun the affected evidence. If the external reviewer is unavailable, record the failure and perform a line-by-line local spec audit without claiming independent approval.

- [ ] **Step 4: Update Linear without rewriting history**

Blocked in this task runtime: `linear` remains enabled with OAuth in Codex configuration, but no Linear tool was injected into the active task and the Linear webview could not attach. No existing comment was edited or deleted, and no completion comment has been added yet.

Add a new Chinese completion comment to ZOO-27 referencing revision Spec comment `3ef03289-cf18-4318-b402-d197adca4766`. Do not update or delete prior comments. Include changed files, exact clipboard contracts, fresh tests/build/browser evidence, unverified native destinations, and commit SHAs. Keep the issue `In Progress` until explicit user acceptance.

- [x] **Step 5: Commit verification bookkeeping**

Check only completed plan items, then:

```bash
git add docs/superpowers/plans/2026-07-15-note-copy-acceptance-fixes.md
git commit -m "docs: record revised note copy verification"
```
