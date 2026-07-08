import { describe, expect, it, vi } from "vitest";

import {
  buildSummaryUserPrompt,
  generateAgentReply,
  buildAgentModelMessages,
  htmlToSummaryMarkdown,
  loadPrompt,
  resolveAIConfig,
  summarizeContent,
} from "./index";

describe("AI summarization", () => {
  it("loads prompts from markdown files outside source code", async () => {
    const prompt = await loadPrompt("summary.zh");

    expect(prompt).toContain("Mewmo");
    expect(prompt).toContain("不要编造");
    expect(prompt).toContain("200 到 400 个中文字");
    expect(prompt).toContain("内容较多时接近 400 字");
    expect(prompt).toContain("内容较少时接近 200 字");
  });

  it("loads the agent system prompt separately from summary prompts", async () => {
    const prompt = await loadPrompt("agent.system.zh");

    expect(prompt).toContain("mewmo");
    expect(prompt).toContain("不要编造");
    expect(prompt).toContain("写入");
  });

  it("builds the article context separately from the system prompt", () => {
    const prompt = buildSummaryUserPrompt({
      type: "clip",
      title: "Readable AI",
      source: "example.com",
      url: "https://example.com/readable-ai",
      content:
        "<h2>Key Point</h2><p>A long article <strong>body</strong></p><p><img src=\"https://example.com/a.png\"></p>",
    });

    expect(prompt).toContain("内容类型：剪藏");
    expect(prompt).toContain("标题：Readable AI");
    expect(prompt).toContain("来源：example.com");
    expect(prompt).toContain("正文（Markdown 清洗版）：\n## Key Point\n\nA long article body");
    expect(prompt).not.toContain("<h2");
    expect(prompt).not.toContain("<img");
  });

  it("converts saved article HTML into markdown-like text for model input", () => {
    const markdown = htmlToSummaryMarkdown(`
      <div class="article">
        <h2 id="toc-1">01 你以为公司慢，是执行慢</h2>
        <blockquote><p>老板看到机会，团队看到风险。</p></blockquote>
        <p>产品担心 <strong>规划</strong> 被打乱，研发担心旧代码。</p>
        <ul><li>先定义 MVP</li><li>30 天验证</li></ul>
        <p><a href="https://example.com">阅读全文</a></p>
        <p><img src="https://example.com/cover.png" alt="cover"></p>
      </div>
    `);

    expect(markdown).toContain("## 01 你以为公司慢，是执行慢");
    expect(markdown).toContain("> 老板看到机会，团队看到风险。");
    expect(markdown).toContain("产品担心规划被打乱，研发担心旧代码。");
    expect(markdown).toContain("- 先定义 MVP");
    expect(markdown).toContain("- 30 天验证");
    expect(markdown).toContain("阅读全文");
    expect(markdown).not.toContain("<");
    expect(markdown).not.toContain("cover.png");
  });

  it("resolves a custom OpenAI-compatible provider from explicit configuration", () => {
    const config = resolveAIConfig({
      AI_PROVIDER: "custom",
      CUSTOM_AI_API_KEY: "custom-key",
      CUSTOM_AI_BASE_URL: "https://custom.example/v1",
      AI_SUMMARY_MODEL: "custom-summary-model",
    });

    expect(config).toEqual({
      provider: "custom",
      apiKey: "custom-key",
      baseUrl: "https://custom.example/v1",
      summaryModel: "custom-summary-model",
    });
  });

  it("calls a custom OpenAI-compatible chat completion endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "这是一段总结。" } }],
      }),
    });

    const summary = await summarizeContent(
      {
        type: "feed_entry",
        title: "RSS Item",
        content: "Article body",
      },
      {
        provider: "custom",
        apiKey: "test-key",
        baseUrl: "https://custom.example/v1",
        model: "summary-model",
        fetch: fetchImpl,
        prompt: "System prompt",
      },
    );

    expect(summary).toBe("这是一段总结。");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://custom.example/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
      }),
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: "summary-model",
      max_tokens: 2048,
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: expect.stringContaining("内容类型：订阅文章") },
      ],
    });
  });

  it("calls the Anthropic messages endpoint when provider is anthropic", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Anthropic summary" }],
      }),
    });

    const summary = await summarizeContent(
      {
        type: "clip",
        title: "Clip",
        content: "Readable body",
      },
      {
        provider: "anthropic",
        apiKey: "anthropic-key",
        model: "claude-summary-model",
        fetch: fetchImpl,
        prompt: "System prompt",
      },
    );

    expect(summary).toBe("Anthropic summary");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": "anthropic-key",
        },
      }),
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: "claude-summary-model",
      system: "System prompt",
      messages: [{ role: "user", content: expect.stringContaining("内容类型：剪藏") }],
    });
  });

  it("builds agent model messages with history and current context", async () => {
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
      {
        role: "user",
        content: expect.stringContaining("当前上下文：剪藏"),
      },
    ]);
    expect(messages.at(-1)?.content).toContain("## 正文");
    expect(messages.at(-1)?.content).toContain("把它提炼成笔记");
    expect(messages.at(-1)?.content).not.toContain("<h2");
  });

  it("calls an OpenAI-compatible endpoint for agent replies", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "可以，我会基于当前文章整理。" } }],
      }),
    });

    const reply = await generateAgentReply(
      {
        history: [],
        userMessage: "总结一下",
      },
      {
        provider: "custom",
        apiKey: "test-key",
        baseUrl: "https://custom.example/v1",
        model: "agent-model",
        fetch: fetchImpl,
        prompt: "Agent system",
      },
    );

    expect(reply).toBe("可以，我会基于当前文章整理。");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://custom.example/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        },
      }),
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: "agent-model",
      max_tokens: 2048,
      messages: [
        { role: "system", content: "Agent system" },
        { role: "user", content: expect.stringContaining("总结一下") },
      ],
    });
  });
});
