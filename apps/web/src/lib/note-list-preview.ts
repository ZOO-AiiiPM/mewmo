import { normalizeListCardPreview } from "./list-card-preview";

export interface NotePreviewSource {
  title: string;
  summary: string | null;
  preview?: string | null | undefined;
  content?: string | null | undefined;
}

export interface NoteMetadataSource extends NotePreviewSource {
  updatedAt: string;
}

const markdownImagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const htmlImagePattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
const tableDividerCellPattern = /^:?-{3,}:?$/;
const DAY = 24 * 60 * 60 * 1000;

export function notePreviewText(note: Pick<NotePreviewSource, "summary" | "preview" | "content">) {
  const source =
    typeof note.content === "string"
      ? note.content
      : note.preview?.trim() || note.summary?.trim() || "";
  const normalized = normalizeListCardPreview(
    source
      .replace(markdownImagePattern, "")
      .replace(htmlImagePattern, ""),
    null,
  )
    .split("\n")
    .map(cleanPreviewLine)
    .filter(Boolean)
    .join("\n");

  return normalizeListCardPreview(normalized);
}

function cleanPreviewLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || /^#{1,6}\s*/.test(trimmed) || isMarkdownTableLine(trimmed)) return "";

  return trimmed
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\[[ xX]\]\s+/, "")
    .replace(/^\s*\d+\.\s+/, "")
    .replace(/={2,}/g, "")
    .replace(/[*_`~>]/g, "")
    .trim();
}

function isMarkdownTableLine(line: string) {
  if (!line.includes("|")) return false;

  const pipeCount = line.match(/\|/g)?.length ?? 0;
  const hasTableEdges = line.startsWith("|") || line.endsWith("|");
  if (pipeCount >= 2 && hasTableEdges) return true;

  const cells = line
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (cells.length === 0) return true;
  if (cells.every((cell) => tableDividerCellPattern.test(cell))) return true;

  const content = cells.join("");
  return !/[A-Za-z0-9\u4e00-\u9fff]/.test(content);
}

export function extractNoteImages(content: string | null | undefined) {
  if (!content) return [];

  const urls = new Set<string>();
  for (const match of content.matchAll(markdownImagePattern)) {
    if (match[1]) urls.add(match[1]);
  }
  for (const match of content.matchAll(htmlImagePattern)) {
    if (match[1]) urls.add(match[1]);
  }
  return [...urls].slice(0, 2);
}

export function formatUpdatedRelative(updatedAt: string, now = new Date()) {
  const updatedTime = new Date(updatedAt).getTime();
  if (Number.isNaN(updatedTime)) return "未知时间";

  const diffMs = Math.max(0, now.getTime() - updatedTime);
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} 天前`;

  return formatNoteDate(updatedAt);
}

export function formatNoteListTime(value: string | Date, now = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.floor((startOfToday.getTime() - startOfDate.getTime()) / DAY);
  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (dayDiff <= 0) return time;
  if (dayDiff === 1) return `昨天 ${time}`;
  if (dayDiff < 7) return `${dayDiff}天前`;
  if (dayDiff < 31) return `${Math.floor(dayDiff / 7)}周前`;

  const monthDiff =
    (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth();
  if (monthDiff < 12) return `${Math.max(1, monthDiff)}个月前`;

  const yearDiff = now.getFullYear() - date.getFullYear();
  return `${Math.max(1, yearDiff)}年前`;
}

export function noteWordCount(content: string | null | undefined) {
  if (!content) return 0;

  const text = content
    .replace(markdownImagePattern, "")
    .replace(htmlImagePattern, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map(cleanCountLine)
    .filter(Boolean)
    .join(" ");
  const cjkChars = text.match(/[\u3400-\u9fff]/g) ?? [];
  const latinText = text.replace(/[\u3400-\u9fff]/g, " ");
  const words = latinText.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) ?? [];
  return cjkChars.length + words.length;
}

export function buildNoteMetadataItems(note: NoteMetadataSource, now = new Date()) {
  return {
    details: [formatUpdatedRelative(note.updatedAt, now)],
  };
}

function cleanCountLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || isMarkdownTableLine(trimmed)) return "";

  return trimmed
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+\.\s+/, "")
    .replace(/```+/g, "")
    .replace(/={2,}/g, "")
    .replace(/[*_`~>()]/g, " ")
    .replaceAll("[", " ")
    .replaceAll("]", " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildNoteCardTitle({
  title,
  updatedAt,
  createdAt,
  preview,
}: {
  title: string;
  updatedAt: string;
  createdAt?: string | undefined;
  preview: string;
}) {
  return [
    title,
    `修改：${formatNoteDateTime(updatedAt)}`,
    createdAt ? `创建：${formatNoteDateTime(createdAt)}` : null,
    preview || null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatNoteDate(date: string) {
  return new Date(date).toLocaleDateString("zh-CN");
}

function formatNoteDateTime(date: string) {
  return new Date(date).toLocaleString("zh-CN");
}
