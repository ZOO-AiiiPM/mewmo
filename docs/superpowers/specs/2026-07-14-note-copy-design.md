# Note Copy Design

## Revision Context

This design supersedes the earlier dual-format adaptive clipboard contract for Linear issue ZOO-27. User acceptance showed that two different interactions need two explicit behaviors:

- The overflow action `复制全文` copies Markdown source only.
- Ordinary editor selection copy remains native browser copy, so destination applications choose the browser-provided rich or plain representation.

The revision also extends `复制全文` to every surface that edits a note: the main notes workspace, Today, and knowledge bases.

## Scope

`复制全文` appears only when the current reader item is a note and current note content is available. It is exposed in the top-right overflow menu of the main notes workspace, Today note reader, and knowledge-base note reader. Clip and feed readers remain unchanged.

The action copies the current title and latest Markdown held in browser state. It does not wait for autosave or reload persisted content. It writes only Markdown-flavoured `text/plain`; it does not write `text/html` and does not inspect the eventual paste destination.

Ordinary `Cmd/Ctrl+C`, including select-all copy inside Crepe, is not intercepted. Instead, legacy `<br>` source is parsed into real editor break nodes so the browser's native selection clipboard contains rendered content rather than literal `<br />` text.

This change does not add a format picker, add a second copy action, modify clips or feeds, or change Worker, Queue, database schema, sharing, or export behavior.

## User Flows

### Copy full Markdown

1. The user opens a note in Notes, Today, or a knowledge base.
2. The reader overflow menu shows one `复制全文` action.
3. Selecting it builds Markdown from the current title and local editor content.
4. The browser calls `clipboard.writeText(markdown)`.
5. Success shows `已复制全文`; failure shows `复制全文失败`.

For title `你好` and body containing a standalone legacy break:

```md
测试

<br />

测试中
```

the clipboard result is exactly:

```md
# 你好

测试

测试中
```

### Native editor copy

1. The user selects part or all of the rendered editor content.
2. The user invokes ordinary `Cmd/Ctrl+C`.
3. Crepe's document contains real paragraph or hard-break nodes, not literal legacy break text.
4. The browser performs its normal copy behavior and supplies its native rich-text and plain-text representations.
5. Word, Markdown editors, WeChat, and other destinations choose the format they support; raw `<p>` or `<br />` source is not shown as text.

The application does not install an `onCopy` override or manually serialize the selection.

## Break Normalization Contract

A shared normalizer handles legacy `<br>`, `<br/>`, and `<br />` variants outside fenced code blocks.

- A break tag on its own line, together with adjacent blank lines, becomes exactly one Markdown paragraph boundary (`\n\n`).
- A break tag inside a text line becomes a Markdown hard break (`two spaces + newline`) so Markdown renderers preserve the line break.
- Repeated surrounding blank lines caused by a standalone break do not accumulate.
- Break-like text inside fenced code remains literal code.
- Line endings are normalized to `\n`; leading and trailing blank space is trimmed for `复制全文` output.

The same semantic normalization feeds the editor parser and the full-copy builder, preventing the displayed document and copied Markdown from disagreeing.

## Editor Parsing

Crepe/Milkdown receives a break-aware Markdown representation in which legacy break tags are real Markdown paragraph or hard-break syntax. The rendered ProseMirror document therefore contains normal DOM paragraphs and `<br>` nodes. Browser-native selection copy can then produce valid rich text without application clipboard interception.

Opening a note must not trigger a save merely because legacy breaks were normalized for the editor. After the user makes a real edit, the editor may persist the normalized Markdown form, gradually removing legacy raw break tags without a bulk data migration.

Because Notes, Today, and knowledge bases all render notes through `NoteEditor`, the parser fix applies consistently to native selection copy on all three surfaces.

## Components

`apps/web/src/lib/note-copy.ts` owns pure Markdown copy behavior:

- A shared break normalizer converts legacy break tags to stable Markdown structure.
- The full-copy builder returns `# <title>` plus normalized current Markdown.
- The clipboard writer calls `writeText` only and propagates failures.

`apps/web/src/components/editor/NoteEditor.tsx` applies the same break normalization before Crepe constructs its document. It does not attach an editor copy handler.

`apps/web/src/components/shell/ReaderToolbar.tsx` continues to render `复制全文` only when `onCopyContent` is provided.

The Notes, Today, and knowledge-base pages each supply `onCopyContent` only for a selected note, using their current local title and content state. They all report the same success and failure toasts.

## Error Handling

If `navigator.clipboard` or `writeText` is unavailable, or the write rejects, the page reports `复制全文失败`. It never claims success after a rejected write. There is no multi-format fallback because `复制全文` intentionally has one Markdown-only contract.

Native selection copy is owned by the browser and does not use this error path.

## Verification

Unit tests prove:

- standalone legacy breaks collapse to one paragraph boundary;
- inline legacy breaks become Markdown hard breaks;
- fenced code preserves literal break-like text;
- full-copy output contains one title heading and no accumulated blank lines;
- full-copy uses `writeText` only and never constructs or writes `text/html`;
- clipboard failures reject for truthful UI feedback.

UI contract tests prove all three note surfaces provide current local note state to `onCopyContent`, while non-note readers do not expose the action. Editor tests prove break normalization is applied before Crepe initialization and no `onCopy` interception is introduced.

Browser verification covers:

- `复制全文` in Notes, Today, and knowledge bases;
- exact Markdown output and normal paragraph spacing;
- native partial and select-all editor copy without literal `<br>` tags;
- native paste behavior into available rich-text and plain-text destinations;
- light and dark menu and toast readability.

## Acceptance

- Notes, Today notes, and knowledge-base notes each expose one `复制全文` action.
- `复制全文` writes only Markdown `text/plain` from current local state.
- Its output has one title heading, stable paragraph spacing, and no literal legacy break tags outside code.
- Ordinary editor copy remains browser-native and does not reveal literal `<br />` text.
- Browser-native rich copy does not expose raw HTML tags as visible text in rich destinations.
- Clip and feed readers remain unchanged.
- Success and failure feedback is truthful.
