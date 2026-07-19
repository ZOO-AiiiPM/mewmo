import { describe, expect, it, vi } from "vitest";

import { listNotesWithPreviews } from "../../apps/web/src/lib/note-list-data";

describe("note list data", () => {
  it("queries a bounded user-scoped source and returns only the normalized preview", async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        id: "note-1",
        slug: "note-1",
        title: "原文换行",
        summary: "AI 摘要",
        pinned: false,
        createdAt: new Date("2026-07-18T00:00:00.000Z"),
        updatedAt: new Date("2026-07-18T01:00:00.000Z"),
        previewSource: "第一段\n\n第二段",
      },
    ]);

    const notes = await listNotesWithPreviews("user-1", {
      $queryRaw: queryRaw,
    } as NonNullable<Parameters<typeof listNotesWithPreviews>[1]>);
    const query = queryRaw.mock.calls[0]?.[0] as {
      text: string;
      values: unknown[];
    };

    expect(query.text).toContain('LEFT(content, $1) AS "previewSource"');
    expect(query.text).toContain("WHERE user_id = $2");
    expect(query.text).toContain("deleted_at IS NULL");
    expect(query.values).toEqual([4096, "user-1"]);
    expect(notes).toEqual([
      {
        id: "note-1",
        slug: "note-1",
        title: "原文换行",
        summary: "AI 摘要",
        pinned: false,
        createdAt: new Date("2026-07-18T00:00:00.000Z"),
        updatedAt: new Date("2026-07-18T01:00:00.000Z"),
        preview: "第一段\n第二段",
      },
    ]);
    expect(notes[0]).not.toHaveProperty("previewSource");
    expect(notes[0]).not.toHaveProperty("content");
  });
});
