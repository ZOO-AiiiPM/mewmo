import { describe, expect, it } from "vitest";

import {
  CHAT_TITLE_MAX_LENGTH,
  DEFAULT_CHAT_TITLE,
  deriveChatTitle,
  relativeTime,
  resolveChatTitle,
} from "../../apps/web/src/lib/agent/chat-display";

describe("deriveChatTitle", () => {
  it("uses short content as-is with whitespace collapsed", () => {
    expect(deriveChatTitle("帮我  整理\n今天的笔记")).toBe("帮我 整理 今天的笔记");
  });

  it("truncates long content to 24 code points", () => {
    const long = "一".repeat(40);
    const title = deriveChatTitle(long);
    expect(title).toBe("一".repeat(CHAT_TITLE_MAX_LENGTH));
    expect(Array.from(title ?? "")).toHaveLength(24);
  });

  it("counts surrogate-pair characters as single code points", () => {
    const emoji = "😀".repeat(30);
    expect(Array.from(deriveChatTitle(emoji) ?? "")).toHaveLength(CHAT_TITLE_MAX_LENGTH);
  });

  it("returns null for empty or whitespace-only content", () => {
    expect(deriveChatTitle("")).toBeNull();
    expect(deriveChatTitle("   \n\t ")).toBeNull();
  });

  it("exposes the default title used for silent auto-rename gating", () => {
    expect(DEFAULT_CHAT_TITLE).toBe("新会话");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-07-30T12:00:00");

  it("returns 刚刚 for timestamps within a minute", () => {
    expect(relativeTime("2026-07-30T11:59:30", now)).toBe("刚刚");
  });

  it("returns minutes below an hour", () => {
    expect(relativeTime("2026-07-30T11:15:00", now)).toBe("45 分钟前");
  });

  it("returns hours below a day", () => {
    expect(relativeTime("2026-07-30T05:00:00", now)).toBe("7 小时前");
  });

  it("falls back to month-day beyond a day", () => {
    expect(relativeTime("2026-07-01T12:00:00", now)).toBe("7-1");
  });

  it("returns empty string for missing or invalid input", () => {
    expect(relativeTime(undefined, now)).toBe("");
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});

describe("resolveChatTitle", () => {
  it("keeps a user-set (non-default) title untouched", () => {
    expect(resolveChatTitle("周报草稿", "总结一下本周进展")).toBe("周报草稿");
  });

  it("falls back to a truncated preview when title is still the default", () => {
    expect(resolveChatTitle(DEFAULT_CHAT_TITLE, "帮我  整理\n今天的笔记")).toBe("帮我 整理 今天的笔记");
    expect(Array.from(resolveChatTitle(DEFAULT_CHAT_TITLE, "一".repeat(40)))).toHaveLength(
      CHAT_TITLE_MAX_LENGTH,
    );
  });

  it("keeps the default title when no usable preview exists", () => {
    expect(resolveChatTitle(DEFAULT_CHAT_TITLE, undefined)).toBe(DEFAULT_CHAT_TITLE);
    expect(resolveChatTitle(DEFAULT_CHAT_TITLE, "   \n ")).toBe(DEFAULT_CHAT_TITLE);
  });

  it("falls back to the default when title is empty and no preview", () => {
    expect(resolveChatTitle("", undefined)).toBe(DEFAULT_CHAT_TITLE);
    expect(resolveChatTitle(undefined, undefined)).toBe(DEFAULT_CHAT_TITLE);
  });
});
