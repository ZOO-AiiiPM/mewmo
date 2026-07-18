import { stripHtml } from "./clip-content";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface ClipCardSource {
  content?: string | null;
  excerpt?: string | null;
  summary?: string | null;
  url: string;
}

export function clipPreviewText(clip: ClipCardSource) {
  const source = stripHtml(clip.excerpt ?? "") || stripHtml(clip.content ?? "");
  return source || clip.summary?.trim() || clip.url;
}

export function formatClipListTime(value: string | Date, now = new Date()) {
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
