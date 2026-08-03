import { describe, expect, it } from "vitest";

import { publicToolResultDetails, publicToolStartDetails } from "./tool-event-display";

describe("public tool event display", () => {
  it("exposes only a bounded search query and public result sources", () => {
    expect(publicToolStartDetails("web_search", { query: "DeepSeek Responses API", apiKey: "secret" }))
      .toEqual(["查询：DeepSeek Responses API"]);
    expect(publicToolResultDetails("web_search", {
      details: { results: [{ title: "DeepSeek docs", url: "https://api-docs.deepseek.com" }] },
      content: [{ type: "text", text: "private raw body" }],
    }, false)).toEqual(["结果：找到 1 项", "来源：DeepSeek docs"]);
  });

  it("never exposes raw errors or note content", () => {
    expect(publicToolResultDetails("content_read", {
      details: { title: "计划", content: "private note" },
    }, false)).toEqual(["结果：已读取 计划"]);
    expect(publicToolResultDetails("content_read", { error: "token=secret" }, true))
      .toEqual(["结果：执行失败，未公开内部错误详情"]);
  });

  it("keeps URL capture details public and productized", () => {
    expect(publicToolStartDetails("clip_url_save", {
      url: "https://example.com/article?token=secret",
    })).toEqual(["目标：example.com"]);
    expect(publicToolResultDetails("clip_url_save", {
      status: "existing",
      content: "private article",
    }, false)).toEqual(["结果：剪藏已存在"]);
    expect(publicToolResultDetails("feed_url_subscribe", {
      status: "created",
    }, false)).toEqual(["结果：已创建订阅"]);
  });
});
