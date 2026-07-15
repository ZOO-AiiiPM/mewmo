import { describe, expect, it, vi } from "vitest";

import type { ModelClient } from "../providers";
import { htmlToSummaryMarkdown } from "../content/normalize";
import { buildArticleSummaryUserPrompt, summarizeArticle } from "./article";

describe("article summarization", () => {
  it("builds clip context with normalized article content", () => {
    const prompt = buildArticleSummaryUserPrompt({
      type: "clip",
      title: "Readable AI",
      source: "example.com",
      url: "https://example.com/readable-ai",
      content:
        '<h2>Key Point</h2><p>A long article <strong>body</strong></p><script>steal()</script><p><img src="cover.png"></p>',
    });

    expect(prompt).toContain("内容类型：剪藏");
    expect(prompt).toContain("标题：Readable AI");
    expect(prompt).toContain("来源：example.com");
    expect(prompt).toContain("正文（Markdown 清洗版）：\n## Key Point\n\nA long article body");
    expect(prompt).not.toContain("<h2");
    expect(prompt).not.toContain("steal()");
    expect(prompt).not.toContain("cover.png");
  });

  it("labels feed entries independently from clips", () => {
    const prompt = buildArticleSummaryUserPrompt({
      type: "feed_entry",
      title: "RSS item",
      content: "Feed body",
    });

    expect(prompt).toContain("内容类型：订阅文章");
  });

  it("preserves useful article structure while removing non-text elements", () => {
    const markdown = htmlToSummaryMarkdown(`
      <style>.hidden { display: none }</style>
      <h2>01 核心结论</h2>
      <blockquote><p>老板看到机会，团队看到风险。</p></blockquote>
      <ul><li>先定义 MVP</li><li>30 天验证</li></ul>
      <iframe src="tracking.html"></iframe>
      <img src="cover.png">
    `);

    expect(markdown).toContain("## 01 核心结论");
    expect(markdown).toContain("> 老板看到机会，团队看到风险。");
    expect(markdown).toContain("- 先定义 MVP");
    expect(markdown).toContain("- 30 天验证");
    expect(markdown).not.toContain("display: none");
    expect(markdown).not.toContain("tracking.html");
    expect(markdown).not.toContain("cover.png");
  });

  it("loads the external summary prompt and delegates to the model client", async () => {
    const complete = vi.fn<ModelClient["complete"]>().mockResolvedValue(" Generated summary ");
    const client: ModelClient = { complete };

    const summary = await summarizeArticle(
      {
        type: "clip",
        title: "Article",
        source: "Example",
        content: "Article body",
      },
      { client },
    );

    expect(summary).toBe("Generated summary");
    expect(complete).toHaveBeenCalledOnce();
    const request = complete.mock.calls[0]?.[0];
    expect(request?.system).toContain("Mewmo");
    expect(request?.system).toContain("不要编造");
    expect(request?.messages).toEqual([
      { role: "user", content: expect.stringContaining("内容类型：剪藏") },
    ]);
    expect(request).toMatchObject({ maxTokens: 2048, temperature: 0.2 });
  });
});
