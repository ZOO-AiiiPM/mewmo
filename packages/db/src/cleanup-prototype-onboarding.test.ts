import { describe, expect, it, vi } from "vitest";

import {
  cleanupPrototypeOnboarding,
  isLegacyPrototypeKnowledgeBase,
} from "./cleanup-prototype-onboarding";

describe("legacy prototype onboarding cleanup", () => {
  it("requires a known title plus a known folder or item fingerprint", () => {
    expect(
      isLegacyPrototypeKnowledgeBase({
        title: "产品设计",
        folders: [{ name: "竞品分析" }],
        items: [],
      }),
    ).toBe(true);
    expect(
      isLegacyPrototypeKnowledgeBase({
        title: "技术笔记",
        folders: [{ name: "pgvector" }],
        items: [],
      }),
    ).toBe(true);
    expect(
      isLegacyPrototypeKnowledgeBase({
        title: "产品设计",
        folders: [{ name: "我的真实项目" }],
        items: [],
      }),
    ).toBe(false);
    expect(
      isLegacyPrototypeKnowledgeBase({
        title: "其他知识库",
        folders: [{ name: "竞品分析" }],
        items: [],
      }),
    ).toBe(false);
  });

  it("is read-only by default and reports exact legacy matches", async () => {
    const deleteKnowledgeBases = vi.fn();
    const deleteNotes = vi.fn();
    const deleteClips = vi.fn();
    const ensureNotes = vi.fn();
    const client = createClient({
      deleteKnowledgeBases,
      deleteNotes,
      deleteClips,
    });

    const report = await cleanupPrototypeOnboarding(client, {
      apply: false,
      ensureNotes,
    });

    expect(report).toEqual({
      users: 2,
      knowledgeBasesMatched: 1,
      legacyNotesMatched: 1,
      legacyClipsMatched: 2,
      knowledgeBasesDeleted: 0,
      legacyNotesDeleted: 0,
      legacyClipsDeleted: 0,
      onboardingNotesCreated: 0,
    });
    expect(deleteKnowledgeBases).not.toHaveBeenCalled();
    expect(deleteNotes).not.toHaveBeenCalled();
    expect(deleteClips).not.toHaveBeenCalled();
    expect(ensureNotes).not.toHaveBeenCalled();
  });

  it("deletes matched rows and backfills every existing account when applied", async () => {
    const deleteKnowledgeBases = vi.fn().mockResolvedValue({ count: 1 });
    const deleteNotes = vi.fn().mockResolvedValue({ count: 1 });
    const deleteClips = vi.fn().mockResolvedValue({ count: 2 });
    const ensureNotes = vi
      .fn()
      .mockResolvedValueOnce({ existing: 0, created: 3 })
      .mockResolvedValueOnce({ existing: 2, created: 1 });
    const client = createClient({
      deleteKnowledgeBases,
      deleteNotes,
      deleteClips,
    });

    const report = await cleanupPrototypeOnboarding(client, {
      apply: true,
      ensureNotes,
    });

    expect(deleteKnowledgeBases).toHaveBeenCalledWith({ where: { id: { in: ["kb-1"] } } });
    expect(deleteNotes).toHaveBeenCalledWith({ where: { id: { in: ["note-old"] } } });
    expect(deleteClips).toHaveBeenCalledWith({ where: { id: { in: ["clip-1", "clip-2"] } } });
    expect(ensureNotes).toHaveBeenCalledTimes(2);
    expect(report.onboardingNotesCreated).toBe(4);
  });
});

function createClient({
  deleteKnowledgeBases,
  deleteNotes,
  deleteClips,
}: {
  deleteKnowledgeBases: ReturnType<typeof vi.fn>;
  deleteNotes: ReturnType<typeof vi.fn>;
  deleteClips: ReturnType<typeof vi.fn>;
}) {
  return {
    user: {
      findMany: vi.fn().mockResolvedValue([{ id: "user-1" }, { id: "user-2" }]),
    },
    knowledgeBase: {
      findMany: vi.fn().mockResolvedValue([
        { id: "kb-1", title: "产品设计", folders: [{ name: "调研" }], items: [] },
        { id: "kb-real", title: "产品设计", folders: [{ name: "客户项目" }], items: [] },
      ]),
      deleteMany: deleteKnowledgeBases,
    },
    note: {
      findMany: vi.fn().mockResolvedValue([{ id: "note-old" }]),
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: deleteNotes,
    },
    clip: {
      findMany: vi.fn().mockResolvedValue([{ id: "clip-1" }, { id: "clip-2" }]),
      deleteMany: deleteClips,
    },
  };
}
