import { describe, expect, it, vi } from "vitest";

import type { AiRuntimePort, WorkflowHandlerContext } from "../contracts";
import { runEmbeddingWorkflow } from "./embedding";
import { runNoteInsightWorkflow } from "./note-insight";
import { runRecommendationWorkflow } from "./recommendation";

function context(ai: AiRuntimePort): WorkflowHandlerContext {
  return {
    ai,
    loadPrompt: vi.fn().mockResolvedValue({
      metadata: { id: "note", version: 1, task: "workflow.note-insight", revision: "revision" },
      content: "Inspect note",
    }),
  };
}

describe("classified AI workflows", () => {
  it("embeds content without using a generative model", async () => {
    const ai: AiRuntimePort = {
      generateText: vi.fn(),
      generateObject: vi.fn(),
      embed: vi.fn().mockResolvedValue([{
        vector: [0.1, 0.2, 0.3],
        dimensions: 3,
        metadata: { profile: "workflow.embedding", model: "fake-embedding" },
      }]),
    };
    const result = await runEmbeddingWorkflow({
      kind: "embedding",
      targetType: "note",
      targetId: "note-1",
      inputVersion: 4,
      currentVersion: 4,
      title: "Caching",
      content: "Cache results locally.",
      summary: null,
    }, context(ai));
    expect(result.dimensions).toBe(3);
    expect(result.contentHash).toHaveLength(64);
    expect(ai.generateText).not.toHaveBeenCalled();
  });

  it("ranks related content deterministically without an LLM", async () => {
    const result = await runRecommendationWorkflow({
      kind: "recommendation",
      targetType: "note",
      targetId: "note-1",
      inputVersion: 1,
      currentVersion: 1,
      candidates: [
        { targetType: "clip", targetId: "clip-low", targetVersion: 1, similarity: 0.6 },
        { targetType: "note", targetId: "note-1", targetVersion: 1, similarity: 1 },
        { targetType: "feed_entry", targetId: "entry-high", targetVersion: 2, similarity: 0.9 },
      ],
    });
    expect(result.relations).toEqual([
      expect.objectContaining({ targetId: "entry-high", rank: 1 }),
      expect.objectContaining({ targetId: "clip-low", rank: 2 }),
    ]);
  });

  it("keeps automatic note insight distinct from Agent deep-insight", async () => {
    const ai: AiRuntimePort = {
      generateText: vi.fn(),
      embed: vi.fn(),
      generateObject: vi.fn().mockResolvedValue({
        value: { insights: [{ type: "duplicate", message: "这与旧笔记观点重复。", evidenceTargetIds: ["note-old"] }] },
        metadata: { profile: "workflow.note-insight", model: "fake-insight" },
        attempts: [{ profile: "workflow.note-insight", model: "fake-insight" }],
      }),
    };
    const result = await runNoteInsightWorkflow({
      kind: "note_insight",
      targetType: "note",
      targetId: "note-1",
      inputVersion: 3,
      currentVersion: 3,
      title: "Current thought",
      content: "Caching reduces perceived latency.",
      related: [{ targetType: "note", targetId: "note-old", title: "Old thought", excerpt: "Caching reduces latency." }],
    }, context(ai));
    expect(result.insights[0]).toMatchObject({ type: "duplicate", evidenceTargetIds: ["note-old"] });
    expect(ai.generateObject).toHaveBeenCalledWith(expect.objectContaining({
      purpose: "workflow.note-insight",
      schema: expect.anything(),
    }));
  });

  it("accepts a bare insight array from an OpenAI-compatible structured response", async () => {
    const ai: AiRuntimePort = {
      generateText: vi.fn(),
      embed: vi.fn(),
      generateObject: vi.fn().mockResolvedValue({
        value: [{ type: "completeness", message: "补充一个反例。", evidenceTargetIds: [] }],
        metadata: { profile: "workflow.note-insight", model: "fake-insight" },
        attempts: [{ profile: "workflow.note-insight", model: "fake-insight" }],
      }),
    };
    const result = await runNoteInsightWorkflow({
      kind: "note_insight",
      targetType: "note",
      targetId: "note-1",
      inputVersion: 3,
      currentVersion: 3,
      title: "Current thought",
      content: "Caching reduces perceived latency.",
      related: [],
    }, context(ai));
    expect(result.insights).toEqual([{ type: "completeness", message: "补充一个反例。", evidenceTargetIds: [] }]);
  });
});
