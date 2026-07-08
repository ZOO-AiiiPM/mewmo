import assert from "node:assert/strict";
import test from "node:test";

const { extractClipFromHtml } = await import("../../apps/web/src/lib/clip-fetch.ts");

test("extracts clip metadata and readable body from page html", () => {
  const page = `
    <!doctype html>
    <html>
      <head>
        <title>Fallback title</title>
        <meta property="og:title" content="OG Article Title">
        <meta name="description" content="Readable summary">
        <meta property="og:image" content="/cover.jpg">
        <link rel="icon" href="/favicon.ico">
      </head>
      <body>
        <main><p>Readable body content with enough words to be selected.</p></main>
      </body>
    </html>`;

  const clip = extractClipFromHtml(page, "https://example.com/articles/a");
  assert.equal(clip.title, "OG Article Title");
  assert.equal(clip.summary, "Readable summary");
  assert.equal(clip.favicon, "https://example.com/favicon.ico");
  assert.equal(clip.coverImage, "https://example.com/cover.jpg");
  assert.match(clip.excerpt, /Readable body content/);
  assert.match(clip.content, /Readable body content/);
});

test("extracts WeChat source, author, and article publish time", () => {
  const publishedSeconds = Math.floor(Date.parse("2026-06-01T09:36:00.000Z") / 1000);
  const page = `
    <!doctype html>
    <html>
      <head>
        <meta property="og:title" content="微信文章">
        <meta name="author" content="腾讯技术工程">
        <script>
          var nickname = htmlDecode("腾讯程序员");
          var ct = "${publishedSeconds}";
        </script>
      </head>
      <body>
        <div id="js_content"><p>公众号正文。</p></div>
      </body>
    </html>`;

  const clip = extractClipFromHtml(page, "https://mp.weixin.qq.com/s/demo");
  assert.equal(clip.sourceName, "腾讯程序员");
  assert.equal(clip.author, "腾讯技术工程");
  assert.equal(clip.publishedAt?.toISOString(), "2026-06-01T09:36:00.000Z");
});

test("extracts WeChat cover image from article body", () => {
  const page = `
    <!doctype html>
    <html>
      <head>
        <meta property="og:title" content="微信文章">
      </head>
      <body>
        <div id="js_content">
          <p>公众号正文。</p>
          <img data-src="https://mmbiz.qpic.cn/cover.png">
        </div>
      </body>
    </html>`;

  const clip = extractClipFromHtml(page, "https://mp.weixin.qq.com/s/demo");
  assert.equal(clip.coverImage, "https://mmbiz.qpic.cn/cover.png");
});

test("extracts WeChat metadata from profile cards and ignores generic descriptions", () => {
  const page = `
    <!doctype html>
    <html>
      <head>
        <meta property="og:title" content="微信文章">
        <meta name="description" content="详尽文档">
      </head>
      <body>
        <div id="js_content">
          <p>公众号正文。</p>
          <mp-common-profile data-nickname="腾讯技术工程"></mp-common-profile>
        </div>
      </body>
    </html>`;

  const clip = extractClipFromHtml(page, "https://mp.weixin.qq.com/s/demo");
  assert.equal(clip.sourceName, "腾讯技术工程");
  assert.equal(clip.author, "腾讯技术工程");
  assert.equal(clip.summary, undefined);
});
