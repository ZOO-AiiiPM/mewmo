import { describe, expect, it } from "vitest";

import {
  activeTocIndexFromHeadingTops,
  buildHtmlToc,
  buildNoteToc,
  tocScrollTopForHeading,
} from "../../apps/web/src/lib/note-toc";

describe("note toc", () => {
  it("builds toc items from markdown headings", () => {
    expect(
      buildNoteToc("# 正文大标题\n\n## 二级标题\n\n### 三级标题\n\n#### 忽略四级"),
    ).toEqual([
      { id: "heading-0", level: 1, title: "正文大标题" },
      { id: "heading-1", level: 2, title: "二级标题" },
      { id: "heading-2", level: 3, title: "三级标题" },
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    expect(buildNoteToc("```md\n# Not heading\n```\n\n# Real heading")).toEqual([
      { id: "heading-0", level: 1, title: "Real heading" },
    ]);
  });

  it("builds toc items from captured html headings", () => {
    expect(
      buildHtmlToc(`
        <article>
          <h1>正文大标题</h1>
          <h2><span>二级</span><em>标题</em></h2>
          <pre><code><h2>Not heading</h2></code></pre>
          <h3>三级 &amp; 标题</h3>
          <h4>忽略四级</h4>
        </article>
      `),
    ).toEqual([
      { id: "heading-0", level: 1, title: "正文大标题" },
      { id: "heading-1", level: 2, title: "二级标题" },
      { id: "heading-2", level: 3, title: "三级 & 标题" },
    ]);
  });

  it("aligns a heading below the toolbar-cleared content top", () => {
    expect(
      tocScrollTopForHeading({
        containerTop: 100,
        headingTop: 420,
        maxScrollTop: 1000,
        scrollTop: 40,
        topOffset: 74,
      }),
    ).toBe(286);
  });

  it("selects the heading nearest the toolbar-cleared content top", () => {
    expect(
      activeTocIndexFromHeadingTops({
        containerTop: 100,
        headingTops: [120, 170, 260],
        topOffset: 74,
      }),
    ).toBe(1);
  });
});
