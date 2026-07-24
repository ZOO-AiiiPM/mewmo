import { describe, expect, it, vi } from "vitest";

import type {
  AiRuntimePort,
  RecommendationCandidate,
  RerankOutcome,
  WorkflowHandlerContext,
} from "../contracts";
import { runEmbeddingWorkflow } from "./embedding";
import { runNoteInsightWorkflow } from "./note-insight";
import { runRecommendationWorkflow } from "./recommendation";

function passthroughRerank(input: { documents: string[] }): RerankOutcome {
  return {
    provider: "passthrough",
    model: "passthrough",
    fellBack: true,
    fallbackReason: "fake_passthrough",
    results: input.documents.map((_doc, index) => ({ index, score: input.documents.length - index })),
  };
}

function context(ai: AiRuntimePort): WorkflowHandlerContext {
  return {
    ai,
    loadPrompt: vi.fn().mockResolvedValue({
      metadata: { id: "note", version: 1, task: "workflow.note-insight", revision: "revision" },
      content: "Inspect note",
    }),
  };
}

function recommendationCandidate(overrides: Partial<RecommendationCandidate> & { targetId: string }): RecommendationCandidate {
  return {
    targetType: "clip",
    targetVersion: 1,
    similarity: 0.5,
    text: `text for ${overrides.targetId}`,
    ...overrides,
  };
}

describe("classified AI workflows", () => {
  it("embeds content without using a generative model", async () => {
    const ai: AiRuntimePort = {
      generateText: vi.fn(),
      generateObject: vi.fn(),
      rerank: vi.fn(),
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

  it("applies reranker order and caps relations at the limit", async () => {
    const rerank = vi.fn(async (input: { documents: string[] }): Promise<RerankOutcome> => ({
      provider: "voyage",
      model: "rerank-2.5-lite",
      fellBack: false,
      // reverse the RRF order to prove rerank ranking wins.
      results: input.documents.map((_doc, index) => ({ index: input.documents.length - 1 - index, score: index })),
    }));
    const ai = { generateText: vi.fn(), generateObject: vi.fn(), embed: vi.fn(), rerank } as unknown as AiRuntimePort;
    const result = await runRecommendationWorkflow({
      kind: "recommendation",
      targetType: "note",
      targetId: "note-1",
      inputVersion: 1,
      currentVersion: 1,
      sourceText: "source note",
      candidates: [
        recommendationCandidate({ targetType: "feed_entry", targetId: "entry-a", targetVersion: 2, similarity: 0.9 }),
        recommendationCandidate({ targetType: "clip", targetId: "clip-b", similarity: 0.6 }),
        recommendationCandidate({ targetType: "note", targetId: "note-1", targetVersion: 1, similarity: 1 }),
      ],
      limit: 2,
    }, context(ai));
    expect(rerank).toHaveBeenCalledOnce();
    // source itself (note-1) is filtered; pool=[entry-a, clip-b]; rerank reverses → [clip-b, entry-a].
    expect(result.relations).toEqual([
      expect.objectContaining({ targetId: "clip-b", rank: 1 }),
      expect.objectContaining({ targetId: "entry-a", rank: 2 }),
    ]);
  });

  it("keeps RRF order when the reranker falls back (passthrough)", async () => {
    const ai = {
      generateText: vi.fn(),
      generateObject: vi.fn(),
      embed: vi.fn(),
      rerank: vi.fn(passthroughRerank),
    } as unknown as AiRuntimePort;
    const result = await runRecommendationWorkflow({
      kind: "recommendation",
      targetType: "note",
      targetId: "note-1",
      inputVersion: 1,
      currentVersion: 1,
      sourceText: "source note",
      candidates: [
        recommendationCandidate({ targetType: "feed_entry", targetId: "entry-a", similarity: 0.9 }),
        recommendationCandidate({ targetType: "clip", targetId: "clip-b", similarity: 0.6 }),
      ],
    }, context(ai));
    expect(result.relations).toEqual([
      expect.objectContaining({ targetId: "entry-a", rank: 1 }),
      expect.objectContaining({ targetId: "clip-b", rank: 2 }),
    ]);
  });

  it("fails open to RRF order when the reranker throws", async () => {
    const ai = {
      generateText: vi.fn(),
      generateObject: vi.fn(),
      embed: vi.fn(),
      rerank: vi.fn().mockRejectedValue(new Error("rerank_timeout")),
    } as unknown as AiRuntimePort;
    const result = await runRecommendationWorkflow({
      kind: "recommendation",
      targetType: "note",
      targetId: "note-1",
      inputVersion: 1,
      currentVersion: 1,
      sourceText: "source note",
      candidates: [
        recommendationCandidate({ targetType: "feed_entry", targetId: "entry-a", similarity: 0.9 }),
        recommendationCandidate({ targetType: "clip", targetId: "clip-b", similarity: 0.6 }),
      ],
    }, context(ai));
    expect(result.relations.map((relation) => relation.targetId)).toEqual(["entry-a", "clip-b"]);
  });

  it("skips rerank and returns empty relations when there are no candidates", async () => {
    const rerank = vi.fn();
    const ai = { generateText: vi.fn(), generateObject: vi.fn(), embed: vi.fn(), rerank } as unknown as AiRuntimePort;
    const result = await runRecommendationWorkflow({
      kind: "recommendation",
      targetType: "note",
      targetId: "note-1",
      inputVersion: 1,
      currentVersion: 1,
      sourceText: "source note",
      candidates: [],
    }, context(ai));
    expect(result.relations).toEqual([]);
    expect(rerank).not.toHaveBeenCalled();
  });

  it("keeps automatic note insight distinct from Agent deep-insight", async () => {
    const ai: AiRuntimePort = {
      generateText: vi.fn(),
      embed: vi.fn(),
      rerank: vi.fn(),
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
      rerank: vi.fn(),
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
