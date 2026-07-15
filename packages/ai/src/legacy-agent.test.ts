import { describe, expect, it, vi } from "vitest";

import type { ModelClient } from "./providers";
import { buildAgentModelMessages, generateAgentReply } from "./legacy-agent";

describe("legacy Agent compatibility", () => {
  it("builds history and normalized current context", () => {
    const messages = buildAgentModelMessages({
      systemPrompt: "Agent system",
      history: [
        { role: "user", content: "上一篇在讲什么？" },
        { role: "assistant", content: "它在讨论产品节奏。" },
      ],
      userMessage: "把它提炼成笔记",
      context: {
        targetType: "clip",
        targetId: "clip-1",
        title: "老板看到机会，团队看到风险",
        sourceUrl: "https://example.com/a",
        summarySnapshot: "产品慢半拍来自组织翻译损耗。",
        contentSnapshot: "<h2>正文</h2><p>市场机会进入组织后被翻译成风险。</p>",
      },
    });

    expect(messages).toEqual([
      { role: "system", content: "Agent system" },
      { role: "user", content: "上一篇在讲什么？" },
      { role: "assistant", content: "它在讨论产品节奏。" },
      { role: "user", content: expect.stringContaining("当前上下文：剪藏") },
    ]);
    expect(messages.at(-1)?.content).toContain("## 正文");
    expect(messages.at(-1)?.content).toContain("把它提炼成笔记");
    expect(messages.at(-1)?.content).not.toContain("<h2");
  });

  it("loads the Agent prompt and delegates through the shared model client", async () => {
    const complete = vi.fn<ModelClient["complete"]>().mockResolvedValue(" Agent reply ");
    const client: ModelClient = { complete };

    const reply = await generateAgentReply(
      {
        history: [],
        userMessage: "总结一下",
      },
      { client },
    );

    expect(reply).toBe("Agent reply");
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0]?.[0]).toMatchObject({
      system: expect.stringContaining("个人知识整理 agent"),
      messages: [{ role: "user", content: "总结一下" }],
      maxTokens: 2048,
      temperature: 0.2,
    });
  });

  it("preserves custom provider requests through the compatibility layer", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "Custom Agent reply" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const reply = await generateAgentReply(
      { history: [], userMessage: "总结一下" },
      {
        provider: "custom",
        apiKey: "custom-key",
        baseUrl: "https://relay.example/v1",
        model: "agent-model",
        fetch: fetchImpl,
        prompt: "Agent system",
      },
    );

    expect(reply).toBe("Custom Agent reply");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://relay.example/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: "agent-model",
      messages: [
        { role: "system", content: "Agent system" },
        { role: "user", content: "总结一下" },
      ],
    });
  });

  it("prefers a real chat model and falls back from placeholder values", async () => {
    const previousChatModel = process.env.AI_CHAT_MODEL;
    const previousSummaryModel = process.env.AI_SUMMARY_MODEL;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "Reply" } }] }), { status: 200 }),
    );

    try {
      process.env.AI_SUMMARY_MODEL = "summary-model";
      process.env.AI_CHAT_MODEL = "chat-model";
      await generateAgentReply(
        { history: [], userMessage: "First" },
        {
          provider: "custom",
          apiKey: "custom-key",
          baseUrl: "https://relay.example/v1",
          fetch: fetchImpl,
          prompt: "Agent system",
        },
      );

      process.env.AI_CHAT_MODEL = "fill-chat-model";
      await generateAgentReply(
        { history: [], userMessage: "Second" },
        {
          provider: "custom",
          apiKey: "custom-key",
          baseUrl: "https://relay.example/v1",
          fetch: fetchImpl,
          prompt: "Agent system",
        },
      );

      expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({ model: "chat-model" });
      expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toMatchObject({ model: "summary-model" });
    } finally {
      restoreEnv("AI_CHAT_MODEL", previousChatModel);
      restoreEnv("AI_SUMMARY_MODEL", previousSummaryModel);
    }
  });
});

function restoreEnv(name: "AI_CHAT_MODEL" | "AI_SUMMARY_MODEL", value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
