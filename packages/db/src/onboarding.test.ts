import { describe, expect, it, vi } from "vitest";

import { ONBOARDING_NOTES, ensureOnboardingNotes } from "./onboarding";

describe("account onboarding notes", () => {
  it("defines exactly three stable notes with the product note pinned first", () => {
    expect(ONBOARDING_NOTES.map((note) => note.slug)).toEqual([
      "welcome-to-mewmo",
      "getting-started-with-mewmo",
      "meet-mewmo-agent",
    ]);
    expect(ONBOARDING_NOTES[0]?.pinned).toBe(true);
    expect(ONBOARDING_NOTES.slice(1).every((note) => !note.pinned)).toBe(true);
    expect(ONBOARDING_NOTES.map((note) => note.title)).toEqual([
      "欢迎来到 mewmo：把信息变成可以继续使用的记忆",
      "开始使用 mewmo：记录、剪藏与整理",
      "认识 mewmo Agent：和你的内容一起思考",
    ]);
  });

  it("creates only missing notes and never overwrites existing slugs", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: "existing-note" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: "created-2" })
      .mockResolvedValueOnce({ id: "created-3" });

    const result = await ensureOnboardingNotes(
      { note: { findUnique, create } },
      "user-1",
    );

    expect(findUnique).toHaveBeenCalledTimes(3);
    expect(findUnique).toHaveBeenNthCalledWith(1, {
      where: { userId_slug: { userId: "user-1", slug: "welcome-to-mewmo" } },
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        userId: "user-1",
        slug: "getting-started-with-mewmo",
        pinned: false,
      },
    });
    expect(result).toEqual({ existing: 1, created: 2 });
  });
});
