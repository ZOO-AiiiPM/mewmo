import { describe, expect, it, vi } from "vitest";

import {
  analyzeVideoTranscript,
  buildVideoAnalysisUserPrompt,
  parseVideoAnalysisResponse,
} from "./index";

const validAnalysis = {
  schemaVersion: 1,
  quickJudgment: {
    summary: "这段视频解释了如何构建可靠的长期记忆。",
    highlights: ["将事实与会话分离"],
    thoughts: ["需要同时设计遗忘机制"],
    terms: [{ term: "长期记忆", explanation: "跨会话保留并可再次检索的信息。" }],
  },
  keyPoints: ["先建立稳定的数据边界"],
  targetAudience: "AI 产品经理",
  chapters: [
    {
      startSeconds: 0,
      endSeconds: 30,
      title: "为什么需要长期记忆",
      theme: "背景",
      summary: "解释单次对话上下文的局限。",
    },
  ],
  highlights: [
    {
      startSeconds: 12,
      title: "记忆不是无限上下文",
      note: "强调检索和遗忘同样重要。",
      score: 92,
    },
  ],
  suggestedTags: ["AI", "长期记忆"],
};

describe("video analysis", () => {
  it("builds a timestamped transcript prompt without article HTML cleanup", () => {
    const prompt = buildVideoAnalysisUserPrompt({
      title: "AI 长期记忆",
      source: "Bilibili",
      url: "https://www.bilibili.com/video/BV1mock001",
      durationSeconds: 75,
      transcript: [
        { startSeconds: 0, endSeconds: 8.5, text: "先理解什么是长期记忆" },
        { startSeconds: 8.5, endSeconds: 15, text: "它不是无限追加上下文" },
      ],
    });

    expect(prompt).toContain("标题：AI 长期记忆");
    expect(prompt).toContain("视频时长：75 秒");
    expect(prompt).toContain("[00:00.000 - 00:08.500] 先理解什么是长期记忆");
    expect(prompt).toContain("[00:08.500 - 00:15.000] 它不是无限追加上下文");
  });

  it("parses plain and fenced JSON into the shared structured contract", () => {
    expect(parseVideoAnalysisResponse(JSON.stringify(validAnalysis))).toEqual(validAnalysis);
    expect(
      parseVideoAnalysisResponse(`\n\`\`\`json\n${JSON.stringify(validAnalysis)}\n\`\`\`\n`),
    ).toEqual(validAnalysis);
  });

  it("rejects malformed or schema-invalid model output", () => {
    expect(() => parseVideoAnalysisResponse("not json")).toThrow("valid JSON");
    expect(() =>
      parseVideoAnalysisResponse(JSON.stringify({ ...validAnalysis, schemaVersion: 2 })),
    ).toThrow();
  });

  it("calls an OpenAI-compatible endpoint and validates the returned analysis", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(validAnalysis) } }],
      }),
    });

    const result = await analyzeVideoTranscript(
      {
        title: "AI 长期记忆",
        transcript: [{ startSeconds: 0, endSeconds: 30, text: "字幕正文" }],
      },
      {
        provider: "custom",
        apiKey: "test-key",
        baseUrl: "https://custom.example/v1",
        model: "video-analysis-model",
        fetch: fetchImpl,
        prompt: "Return JSON only",
      },
    );

    expect(result).toEqual(validAnalysis);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://custom.example/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: "video-analysis-model",
      max_tokens: 4096,
      messages: [
        { role: "system", content: "Return JSON only" },
        { role: "user", content: expect.stringContaining("带时间戳字幕") },
      ],
    });
  });

  it("surfaces provider failures without returning partial analysis", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "temporarily unavailable",
    });

    await expect(
      analyzeVideoTranscript(
        {
          title: "AI 长期记忆",
          transcript: [{ startSeconds: 0, endSeconds: 30, text: "字幕正文" }],
        },
        {
          provider: "custom",
          apiKey: "test-key",
          baseUrl: "https://custom.example/v1",
          model: "video-analysis-model",
          fetch: fetchImpl,
          prompt: "Return JSON only",
        },
      ),
    ).rejects.toThrow("AI video analysis request failed: 503");
  });
});
