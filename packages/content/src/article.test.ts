import { describe, expect, it } from "vitest";

import { extractArticleFromHtml } from "./article";

describe("extractArticleFromHtml", () => {
  it("maps page descriptions to excerpt without creating an AI summary", () => {
    const article = extractArticleFromHtml(`
      <!doctype html><html><head>
        <meta property="og:title" content="Article">
        <meta name="description" content="Publisher description">
      </head><body><main><p>Readable body.</p></main></body></html>
    `, "https://example.com/article");

    expect(article.title).toBe("Article");
    expect(article.excerpt).toBe("Publisher description");
    expect(article).not.toHaveProperty("summary");
  });

  it("falls back to a body excerpt when publisher metadata is generic", () => {
    const article = extractArticleFromHtml(`
      <!doctype html><html><head>
        <meta property="og:title" content="微信文章">
        <meta name="description" content="详尽文档">
      </head><body><div id="js_content"><p>公众号正文。</p></div></body></html>
    `, "https://mp.weixin.qq.com/s/demo");

    expect(article.excerpt).toBe("公众号正文。");
    expect(article).not.toHaveProperty("summary");
  });
});
