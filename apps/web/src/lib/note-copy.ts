import {
  parseSharedNoteMarkdown,
  type SharedNoteMarkdownBlock,
  type SharedNoteMarkdownInline,
} from "./shared-note-markdown";

export interface NoteCopyPayload {
  plainText: string;
  html: string;
}

export interface NoteClipboard {
  write?: (items: ClipboardItem[]) => Promise<void>;
  writeText: (text: string) => Promise<void>;
}

export function buildNoteCopyPayload({
  title,
  markdown,
}: {
  title: string;
  markdown: string;
}): NoteCopyPayload {
  const normalizedTitle = title.trim() || "Untitled";
  const plainMarkdown = markdown.replace(/<br\s*\/?>/gi, "\n").trim();
  const plainText = [`# ${normalizedTitle}`, plainMarkdown]
    .filter(Boolean)
    .join("\n\n");
  const body = parseSharedNoteMarkdown(markdown.trim()).map(renderBlock).join("");

  return {
    plainText,
    html: `<article><h1>${escapeHtml(normalizedTitle)}</h1>${body}</article>`,
  };
}

export async function copyNoteToClipboard(
  payload: NoteCopyPayload,
  clipboard: NoteClipboard | undefined,
  ClipboardItemConstructor: typeof ClipboardItem | undefined,
) {
  if (!clipboard) throw new Error("Clipboard is unavailable");

  const supportsRichHtml =
    ClipboardItemConstructor &&
    (typeof ClipboardItemConstructor.supports !== "function" ||
      ClipboardItemConstructor.supports("text/html"));

  if (clipboard.write && ClipboardItemConstructor && supportsRichHtml) {
    try {
      const item = new ClipboardItemConstructor({
        "text/plain": new Blob([payload.plainText], { type: "text/plain" }),
        "text/html": new Blob([payload.html], { type: "text/html" }),
      });
      await clipboard.write([item]);
      return;
    } catch (error) {
      if (!isNotSupportedError(error)) throw error;
    }
  }

  await clipboard.writeText(payload.plainText);
}

function isNotSupportedError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotSupportedError"
  );
}

function renderBlock(block: SharedNoteMarkdownBlock): string {
  switch (block.type) {
    case "heading":
      return `<h${block.level}>${renderInline(block.children)}</h${block.level}>`;
    case "paragraph":
      return `<p>${renderInline(block.children)}</p>`;
    case "blockquote":
      return `<blockquote><p>${renderInline(block.children)}</p></blockquote>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag}>${block.items
        .map((item) => `<li>${renderInline(item)}</li>`)
        .join("")}</${tag}>`;
    }
    case "code": {
      const language = block.language
        ? ` class="language-${escapeAttribute(block.language)}"`
        : "";
      return `<pre><code${language}>${escapeHtml(block.code)}</code></pre>`;
    }
    case "image":
      return `<img src="${escapeAttribute(block.src)}" alt="${escapeAttribute(block.alt)}">`;
    case "table":
      return `<table><thead><tr>${block.headers
        .map((cell) => `<th>${renderInline(cell)}</th>`)
        .join("")}</tr></thead><tbody>${block.rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell) => `<td>${renderInline(cell)}</td>`)
              .join("")}</tr>`,
        )
        .join("")}</tbody></table>`;
  }
}

function renderInline(items: SharedNoteMarkdownInline[]): string {
  return items
    .map((item) => {
      switch (item.type) {
        case "text":
          return renderText(item.value);
        case "strong":
          return `<strong>${renderInline(item.children)}</strong>`;
        case "emphasis":
          return `<em>${renderInline(item.children)}</em>`;
        case "code":
          return `<code>${escapeHtml(item.value)}</code>`;
        case "link":
          return `<a href="${escapeAttribute(item.href)}">${renderInline(item.children)}</a>`;
        case "image":
          return `<img src="${escapeAttribute(item.src)}" alt="${escapeAttribute(item.alt)}">`;
      }
    })
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderText(value: string) {
  return value.split(/<br\s*\/?>/gi).map(escapeHtml).join("<br>");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}
