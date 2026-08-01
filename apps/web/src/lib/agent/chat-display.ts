/**
 * Small display helpers for the chat history panel and auto-naming.
 * Pure functions — unit tested in tests/unit/agent-chat-display.test.ts.
 */

export const DEFAULT_CHAT_TITLE = "新会话";

export const CHAT_TITLE_MAX_LENGTH = 24;

/**
 * Derive a chat title from the first user message: whitespace collapsed and
 * truncated to 24 characters (code points). Returns null when nothing usable.
 */
export function deriveChatTitle(content: string, maxLength = CHAT_TITLE_MAX_LENGTH): string | null {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const chars = Array.from(normalized);
  if (chars.length <= maxLength) return normalized;
  return chars.slice(0, maxLength).join("");
}

/**
 * Choose what to show as a chat's list title. Keeps a user-set (non-default)
 * title as-is; otherwise falls back to a truncated preview of the first user
 * message, and finally to the default title when nothing usable exists.
 */
export function resolveChatTitle(
  title: string | undefined,
  preview: string | undefined,
  maxLength = CHAT_TITLE_MAX_LENGTH,
): string {
  const trimmed = (title ?? "").trim();
  if (trimmed && trimmed !== DEFAULT_CHAT_TITLE) return trimmed;
  const derived = preview ? deriveChatTitle(preview, maxLength) : null;
  return derived ?? DEFAULT_CHAT_TITLE;
}

/**
 * Compact relative timestamp for list rows: 刚刚 / N 分钟前 / N 小时前 / M-D.
 */
export function relativeTime(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return "";
  const diffMs = now.getTime() - time.getTime();
  if (diffMs < 60_000) return "刚刚";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${time.getMonth() + 1}-${time.getDate()}`;
}
