import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("apps/web/src/components/editor/NoteEditor.tsx", "utf8");
const theme = readFileSync("apps/web/src/components/editor/editor-theme.css", "utf8");

describe("note editor Crepe configuration", () => {
  it("keeps the selected-text toolbar disabled", () => {
    expect(source).toContain("[Crepe.Feature.Toolbar]: false");
  });

  it("removes empty-editor placeholder text", () => {
    expect(source).toContain("[Crepe.Feature.Placeholder]: false");
    expect(theme).toContain(".crepe-placeholder::before");
    expect(theme).toContain("content: none");
  });

  it("uses the native browser caret instead of Crepe's virtual cursor overlay", () => {
    expect(source).toContain("[Crepe.Feature.Cursor]: { virtual: false }");
    expect(theme).not.toContain(".prosemirror-virtual-cursor");
  });

  it("keeps the editable blank paragraph after a code block visible", () => {
    expect(theme).not.toMatch(/\.milkdown-code-block \+ p(?::empty|:has\([^)]*\))?[\s\S]{0,180}(?:height|min-height):\s*0/);
    expect(theme).toMatch(/\.crepe-editor-wrapper \.milkdown \.ProseMirror \.milkdown-code-block \+ p\s*\{[\s\S]*min-height:\s*(?!0\b)[^;}]+/);
  });

  it("gives editor popup menus the prototype card motion", () => {
    expect(theme).toMatch(
      /\.crepe-editor-wrapper \.milkdown \.milkdown-slash-menu\s*\{[\s\S]*transform-origin:\s*top left[\s\S]*transition:/,
    );
    expect(theme).toMatch(
      /\.crepe-editor-wrapper \.mewmo-block-style-menu\s*\{[\s\S]*transition:/,
    );
    expect(theme).toMatch(
      /\.crepe-editor-wrapper \.milkdown \.milkdown-code-block \.list-wrapper\s*\{[^}]*transform-origin:\s*top left[^}]*transition:/,
    );
    expect(theme).not.toMatch(/mewmoEditorMenuIn|@keyframes\s+mewmoEditorMenuIn/);
  });

  it("lets the reader scroll container own vertical scrolling in embedded mode", () => {
    expect(source).not.toContain("h-full crepe-editor-wrapper crepe-editor-wrapper--embedded");
    expect(theme).not.toMatch(/\.crepe-editor-wrapper--embedded\s*\{[\s\S]*height:\s*100%/);
    expect(theme).not.toMatch(/\.crepe-editor-wrapper--embedded \.milkdown\s*\{[\s\S]*height:\s*100%/);
  });

  it("uses local note drafts for unsynced content and background retry", () => {
    expect(source).toContain(
      "resolveInitialNoteContent(initialContent, readNoteContentDraft(noteId))",
    );
    expect(source).toContain("queueNoteContentSync(noteId, content)");
    expect(source).toContain("retryStoredNoteContent(noteId, draft.content)");
  });

  it("uploads pasted editor images through the permanent note image endpoint", () => {
    expect(source).toContain("[Crepe.Feature.ImageBlock]");
    expect(source).toContain("onUpload: (file: File) => uploadNoteImage(noteId, file)");
    expect(source).not.toContain("URL.createObjectURL(file)");
  });
});
