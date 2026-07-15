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
