import { describe, expect, it, vi } from "vitest";

import { extractArticleFromHtml, fetchArticleFromUrl } from "./article";

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

  it("normalizes repeatedly escaped article title metadata", () => {
    const article = extractArticleFromHtml(`
      <!doctype html><html><head>
        <meta property="og:title" content="产品设计 &amp;amp;#8211; 网页 &amp; Research">
      </head><body><main><p>Readable body.</p></main></body></html>
    `, "https://example.com/article");

    expect(article.title).toBe("产品设计 – 网页 & Research");
  });

  it("fetches articles through the validated outbound boundary", async () => {
    const fetchArticle = vi.fn().mockResolvedValue(new Response(
      "<!doctype html><title>Article</title><article><p>Body</p></article>",
      { headers: { "content-type": "text/html" } },
    ));

    const article = await fetchArticleFromUrl("https://example.com/article", {
      fetchArticle,
      lookupHost: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
    });

    expect(article.title).toBe("Article");
    expect(fetchArticle).toHaveBeenCalledWith(
      new URL("https://example.com/article"),
      expect.objectContaining({ redirect: "manual", signal: expect.any(AbortSignal) }),
    );
  });

  it("blocks private article URLs before issuing a request", async () => {
    const fetchArticle = vi.fn();

    await expect(fetchArticleFromUrl("http://[::1]/article", { fetchArticle }))
      .rejects.toThrow("blocked address");
    expect(fetchArticle).not.toHaveBeenCalled();
  });
});
