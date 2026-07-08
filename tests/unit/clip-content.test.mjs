import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const {
  extractClipBodyHtml,
  isLightNeutralInlineColor,
  isNeutralInlineColor,
  sanitizeClipHtml,
} = await import("../../apps/web/src/lib/clip-content.ts");

test("clip content tools preserve WeChat article body and lazy images", () => {
  const html = `
    <!doctype html>
    <html>
      <body>
        <nav>noise</nav>
        <div id="js_content">
          <p style="color: rgb(117, 117, 117); font-size: 16px; position: fixed">正文</p>
          <img data-src="https://mmbiz.qpic.cn/sz_mmbiz_png/demo/640" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="cover">
          <script>alert("x")</script>
        </div>
      </body>
    </html>`;

  const body = extractClipBodyHtml(html);
  assert.match(body, /正文/);
  assert.doesNotMatch(body, /<nav>/);

  const sanitized = sanitizeClipHtml(body, "https://mp.weixin.qq.com/s/a");
  assert.match(
    sanitized,
    /src="https:\/\/mmbiz\.qpic\.cn\/sz_mmbiz_png\/demo\/640"/,
  );
  assert.match(
    sanitized,
    /style="color: rgb\(117, 117, 117\); font-size: 16px"/,
  );
  assert.doesNotMatch(sanitized, /script|position|data-src|base64/);
});

test("clip content tools preserve WeChat lazy image fallbacks", () => {
  const sanitized = sanitizeClipHtml(
    '<p>表情 <img data-lazy-src="https://mmbiz.qpic.cn/sz_mmbiz_gif/demo/640?wx_fmt=gif&amp;from=appmsg" class="rich_pages wxw-img" data-type="gif"></p>',
    "https://mp.weixin.qq.com/s/demo",
    { proxyImages: true },
  );

  assert.match(sanitized, /<img src="\/api\/image-proxy\?url=/);
  assert.match(sanitized, /wx_fmt%3Dgif%26from%3Dappmsg/);
  assert.doesNotMatch(sanitized, /%26amp%3Bfrom|<img><\/p>/);
});

test("clip content tools remove images without a usable source", () => {
  const sanitized = sanitizeClipHtml(
    '<p>前 <img data-src="" src=""> 后</p>',
    "https://mp.weixin.qq.com/s/demo",
    { proxyImages: true },
  );

  assert.equal(sanitized, "<p>前  后</p>");
});

test("clip content tools can proxy remote images for reader rendering", () => {
  const sanitized = sanitizeClipHtml(
    '<p><img src="https://rssfile.sspai.com/a.png?x=1" alt="cover"></p>',
    "https://sspai.com/post/1",
    { proxyImages: true },
  );

  assert.match(
    sanitized,
    /src="\/api\/image-proxy\?url=https%3A%2F%2Frssfile\.sspai\.com%2Fa\.png%3Fx%3D1"/,
  );
  assert.match(sanitized, /alt="cover"/);
});

test("clip content tools keep emoji-like images inline", () => {
  const sanitized = sanitizeClipHtml(
    '<p>不错 <img class="emoji" src="https://example.com/clap.png" width="24" height="24" alt="👏"> 继续</p>',
    "https://example.com/post",
    { proxyImages: true },
  );

  assert.match(sanitized, /class="mewmo-inline-emoji"/);
  assert.match(sanitized, /alt="👏"/);
});

test("clip content tools keep width-only emoji images inline", () => {
  const sanitized = sanitizeClipHtml(
    '<p>还是挺有意思 <img src="https://cdnfile.sspai.com/2026/07/like.png" width="40" alt="赞"> 继续看</p>',
    "https://sspai.com/post/1",
    { proxyImages: true },
  );

  assert.match(sanitized, /class="mewmo-inline-emoji"/);
  assert.match(sanitized, /alt="赞"/);
});

test("clip content tools remove article footer reactions and comments", () => {
  const sanitized = sanitizeClipHtml(
    `
      <div class="article__main__content">
        <p>真正正文。</p>
        <div class="article__footer">相关文章</div>
        <div class="emoji__reaction__list">
          <div class="emoji"><img src="https://cdnfile.sspai.com/like.png" width="40" alt="赞"></div>
          <span>2</span>
        </div>
        <div class="comment__footer__wrapper">
          <img src="https://cdnfile.sspai.com/avatar.png" width="32" alt="用户">
          <span>评论内容</span>
        </div>
        <div class="common__comment__brief">更多评论</div>
      </div>
    `,
    "https://sspai.com/post/1",
    { proxyImages: true },
  );

  assert.match(sanitized, /真正正文/);
  assert.doesNotMatch(sanitized, /相关文章|评论内容|更多评论|alt="赞"|alt="用户"/);
});

test("clip content tools prefer article body over site chrome inside article", () => {
  const html = `
    <!doctype html>
    <html>
      <body>
        <article>
          <div class="article__header">
            <h1>站点标题</h1>
            <p>Matrix 精选 2026 年 06 月 30 日 11 分钟阅读</p>
          </div>
          <div class="article__content">
            <p>真正的正文第一段。</p>
            <p>真正的正文第二段。</p>
          </div>
          <div class="article__footer">相关文章和站点页脚</div>
        </article>
      </body>
    </html>`;

  const body = extractClipBodyHtml(html);

  assert.match(body, /真正的正文第一段/);
  assert.doesNotMatch(body, /Matrix 精选/);
  assert.doesNotMatch(body, /相关文章和站点页脚/);
});

test("clip content tools keep SSPAI multi-section reviews instead of the download footer", () => {
  const html = `
    <!doctype html>
    <html>
      <body>
        <header>少数派导航</header>
        <article class="normal-article">
          <div class="article-body">
            <div class="post__body__extend__item">
              <h2 class="post__body__extend__item__title">Trayzero：采用 GTD 理念的任务管理工具</h2>
              <div class="post__body__extend__item__content wangEditor-txt">
                <p>Trayzero 会在应用首页给出醒目的提示，来引导我们处理收件箱内的所有任务。</p>
              </div>
              <div class="comment__footer__wrapper">评论和表情</div>
            </div>
            <hr class="article__section__wrapper">
            <div class="post__body__extend__item">
              <h2 class="post__body__extend__item__title">ObtainX：更现代化的 Obtainium 增强版</h2>
              <div class="post__body__extend__item__content wangEditor-txt">
                <p>ObtainX 最大的改进就是提升了 App 的添加效率。</p>
              </div>
            </div>
            <div class="article__main__content wangEditor-txt">
              <p>&gt; 下载 <a href="https://sspai.com/page/client">少数派 2.0 客户端</a>、关注少数派公众号</p>
              <p>&gt; 实用、好用的正版软件，少数派为你呈现</p>
            </div>
          </div>
        </article>
      </body>
    </html>`;

  const body = extractClipBodyHtml(html);
  const sanitized = sanitizeClipHtml(body, "https://sspai.com/post/111999");

  assert.match(body, /Trayzero/);
  assert.match(body, /ObtainX/);
  assert.doesNotMatch(body, /少数派导航/);
  assert.match(sanitized, /处理收件箱内的所有任务/);
  assert.doesNotMatch(sanitized, /下载 .*少数派 2.0 客户端|评论和表情/);
});

test("clip content tools prefer precise nested article content containers", () => {
  const html = `
    <!doctype html>
    <html>
      <body>
        <article>
          <div class="article__content">
            <div class="article__main__wrapper">
              <div class="article__main__content wangEditor-txt">
                <p>更精确的正文内容。</p>
              </div>
            </div>
          </div>
        </article>
      </body>
    </html>`;

  const body = extractClipBodyHtml(html);

  assert.match(body, /更精确的正文内容/);
  assert.doesNotMatch(body, /article__main__wrapper/);
});

test("clip content tools prefer WordPress article body over site navigation", () => {
  const html = `
    <!doctype html>
    <html>
      <body>
        <header>
          <ul>
            <li>首页</li>
            <li>培训课程</li>
            <li>分类浏览</li>
          </ul>
        </header>
        <div class="main-content">
          <div class="article--wrapper">
            <h2 class="article--title">老板看到机会，团队看到风险</h2>
            <div class="article--content grap">
              <p>真正正文第一段。</p>
              <div class="js-star yyp--fancyPost" data-id="45"></div>
              <p>真正正文第二段。</p>
              <div class="article--copyright">未经许可，禁止转载。</div>
            </div>
          </div>
        </div>
        <div class="relatedPosts">猜你喜欢</div>
      </body>
    </html>`;

  const body = extractClipBodyHtml(html);
  const sanitized = sanitizeClipHtml(body, "https://www.woshipm.com/pd/1.html");

  assert.match(body, /真正正文第一段/);
  assert.doesNotMatch(body, /首页|培训课程|分类浏览|猜你喜欢/);
  assert.match(sanitized, /真正正文第二段/);
  assert.doesNotMatch(sanitized, /js-star|未经许可|禁止转载/);
});

test("clip content tools detect neutral inline colors for dark mode", () => {
  assert.equal(isNeutralInlineColor("rgb(117, 117, 117)"), true);
  assert.equal(isNeutralInlineColor("#777"), true);
  assert.equal(isNeutralInlineColor("#cc3344"), false);
});

test("clip content tools detect light neutral inline backgrounds for dark mode", () => {
  assert.equal(isLightNeutralInlineColor("rgb(255, 255, 255)"), true);
  assert.equal(isLightNeutralInlineColor("rgba(250, 250, 250, 0.95)"), true);
  assert.equal(isLightNeutralInlineColor("#f5f5f5"), true);
  assert.equal(isLightNeutralInlineColor("rgb(20, 20, 20)"), false);
  assert.equal(isLightNeutralInlineColor("rgb(255, 104, 39)"), false);
});

test("clip color parsing avoids unchecked hex string indexes", () => {
  const source = readFileSync("apps/web/src/lib/clip-content.ts", "utf8");

  assert.doesNotMatch(
    source,
    /hex\[\d\]/,
    "strict builds should not read hex characters with possibly undefined indexes",
  );
});

test("clip attribute parsing guards optional regex capture groups", () => {
  const source = readFileSync("apps/web/src/lib/clip-content.ts", "utf8");

  assert.doesNotMatch(
    source,
    /match\[1\]\.toLowerCase\(\)/,
    "strict builds should guard regex capture groups before calling string methods",
  );
});

test("clip reader styles explicitly render list markers", () => {
  const source = readFileSync("apps/web/src/app/globals.css", "utf8");

  assert.match(source, /\.mewmo-clip-prose ul\s*{[^}]*list-style:\s*disc/s);
  assert.match(source, /\.mewmo-clip-prose ol\s*{[^}]*list-style:\s*decimal/s);
  assert.match(source, /\.mewmo-clip-prose li\s*{[^}]*display:\s*list-item/s);
});

test("clip renderer clears WeChat light inline backgrounds in dark mode", () => {
  const source = readFileSync(
    "apps/web/src/components/clips/ClipContentRenderer.tsx",
    "utf8",
  );

  assert.match(source, /isLightNeutralInlineColor/);
  assert.match(source, /dataset\.origBackground/);
  assert.match(source, /element\.style\.background\s*=/);
  assert.match(source, /element\.style\.backgroundColor\s*=/);
});
