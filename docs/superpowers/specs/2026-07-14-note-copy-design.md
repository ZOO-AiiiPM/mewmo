# Note Copy Design

## Scope

This design resolves Linear issue ZOO-27 by adding one `复制全文` action to the note reader's top-right overflow menu. One click copies the current note in both Markdown-friendly plain text and rich HTML so the destination application can choose the format it supports.

The action copies the note title and the latest editor content held in browser state. It does not wait for autosave or reload content from the server, because copying stale persisted content would contradict what the user can currently see and edit.

This change does not intercept ordinary `Cmd/Ctrl+C`, add a format picker, detect the destination application, or change clips, feeds, sharing, export, Worker, Queue, or database behavior.

## User Flow

1. The user opens a note and selects the reader's top-right overflow menu.
2. The notes-only menu shows one `复制全文` item with the existing copy icon.
3. Selecting it builds plain-text and HTML representations from the current title and editor content.
4. A capable browser writes both representations in one clipboard item. The destination application chooses which representation to paste.
5. A browser without multi-format clipboard support falls back to writing plain text.
6. Success shows `已复制全文`. A failed clipboard write shows `复制全文失败`.

The menu closes immediately through the existing `runMenuAction` behavior. An empty body still copies the title, so the action never reports success with an empty clipboard for a named note.

## Clipboard Contract

The plain-text representation is:

```text
# <title>

<markdown body>
```

The title is a Markdown level-one heading, and the body keeps Markdown syntax so Markdown editors can render headings, emphasis, lists, links, code, and tables. HTML break tags written as `<br>`, `<br/>`, or `<br />` are normalized to real newline characters before the text is copied. Leading and trailing blank space is trimmed without changing internal Markdown structure.

The HTML representation contains an escaped `<h1>` title followed by HTML serialized from the existing safe shared-note Markdown block model. The serializer supports the structures already represented by `parseSharedNoteMarkdown`: headings, paragraphs, blockquotes, ordered and unordered lists, fenced code, safe images, tables, strong text, emphasis, inline code, safe links, and inline images.

Raw HTML in note Markdown remains text. It is escaped rather than inserted as executable markup. Safe URL checks continue to live in the existing parser, so the clipboard serializer does not create a second, weaker URL policy.

## Components

`apps/web/src/lib/note-copy.ts` owns pure conversion and clipboard writing:

- `buildNoteCopyPayload({ title, markdown })` returns `{ plainText, html }`.
- `copyNoteToClipboard(payload, clipboard, ClipboardItemConstructor)` writes one multi-format item when supported and otherwise calls `writeText(plainText)`.
- HTML serialization is private to the module and consumes the existing shared-note Markdown block types.

Keeping conversion pure makes formatting testable without browser APIs. Passing clipboard capabilities into the writer makes both the multi-format path and fallback path deterministic in tests.

`apps/web/src/components/shell/ReaderToolbar.tsx` adds an optional `onCopyContent` callback. Only the notes menu renders `复制全文`; feed and clip menus remain unchanged.

`apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx` builds the payload from `selectedNote.title` and `editorContent`, invokes the clipboard writer, and reports success or failure through the existing toast provider. `editorContent` is the source for the body because it is updated by the editor before persistence completes.

## Error Handling

The writer first checks for both `clipboard.write` and a usable `ClipboardItem` constructor. If either is unavailable, it uses `clipboard.writeText`. If the available clipboard operation rejects, the error propagates to the page handler, which reports `复制全文失败` and does not claim that content was copied.

The feature does not silently retry a rejected permission request. Repeated writes could trigger additional permission prompts and would make success reporting ambiguous.

## Verification

Unit tests prove:

- title and current Markdown body are present in plain text;
- `<br>` variants become newlines and do not remain as tags;
- an empty body still copies the title;
- HTML preserves every supported block and inline structure;
- raw HTML and unsafe content are escaped rather than executed;
- a capable clipboard receives one item with `text/plain` and `text/html`;
- missing multi-format support falls back to `writeText`;
- clipboard failures reject for the UI handler to report.

UI contract tests prove `复制全文` is notes-only and is wired from the current title and `editorContent`. Focused unit tests run first, followed by Web lint/build and the repository verification commands relevant to the changed boundaries.

Browser verification opens a real note, invokes the overflow action, checks the success toast and pasted plain-text result, and repeats the menu interaction in light and dark themes. No new color styling is planned, but both themes are still checked because the action appears inside shared popover UI.

## Acceptance

- The note overflow menu contains one `复制全文` action.
- One click writes plain text and rich HTML without asking the user to choose a format.
- Plain text contains the title and latest Markdown body without literal `<br />` tags.
- Rich HTML preserves supported formatting and does not execute raw note HTML.
- Unsupported multi-format clipboard APIs fall back to plain text.
- Success and failure feedback are truthful.
- Clip and feed menus are unchanged.
