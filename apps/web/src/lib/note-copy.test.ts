import { describe, expect, it } from "vitest";

import { buildNoteCopyPayload } from "./note-copy";

describe("note copy payload", () => {
  it("copies the title as a heading and normalizes html break tags", () => {
    const payload = buildNoteCopyPayload({
      title: "产品定位",
      markdown: "第一行<br />第二行<br>第三行<br/>第四行",
    });

    expect(payload.plainText).toBe("# 产品定位\n\n第一行\n第二行\n第三行\n第四行");
    expect(payload.plainText).not.toMatch(/<br\s*\/?\s*>/i);
    expect(payload.html).toContain("<p>第一行<br>第二行<br>第三行<br>第四行</p>");
  });

  it("keeps supported markdown structure in safe rich html", () => {
    const payload = buildNoteCopyPayload({
      title: "格式测试",
      markdown: `## 小节

正文含 **重点**、*斜体*、[链接](https://example.com) 和 \`代码\`。

- 第一项
- 第二项

> 引用

\`\`\`ts
const value = 1;
\`\`\`

| 名称 | 值 |
| --- | --- |
| A | B |`,
    });

    expect(payload.html).toContain("<article>");
    expect(payload.html).toContain("<h1>格式测试</h1>");
    expect(payload.html).toContain("<h2>小节</h2>");
    expect(payload.html).toContain("<strong>重点</strong>");
    expect(payload.html).toContain("<em>斜体</em>");
    expect(payload.html).toContain('<a href="https://example.com">链接</a>');
    expect(payload.html).toContain("<ul><li>第一项</li><li>第二项</li></ul>");
    expect(payload.html).toContain("<blockquote><p>引用</p></blockquote>");
    expect(payload.html).toContain('<code class="language-ts">const value = 1;</code>');
    expect(payload.html).toContain("<table>");
  });

  it("escapes raw html and still copies an empty note title", () => {
    expect(buildNoteCopyPayload({ title: "空笔记", markdown: "" })).toEqual({
      plainText: "# 空笔记",
      html: "<article><h1>空笔记</h1></article>",
    });

    const unsafe = buildNoteCopyPayload({
      title: "<标题>",
      markdown: '<script>alert("x")</script>',
    });
    expect(unsafe.html).toContain("<h1>&lt;标题&gt;</h1>");
    expect(unsafe.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(unsafe.html).not.toContain("<script>");
  });
});
