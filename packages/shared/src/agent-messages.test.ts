import { describe, expect, it } from "vitest";

import { visibleAgentUserContent } from "./agent-messages";

describe("visibleAgentUserContent", () => {
  it("keeps ordinary user messages unchanged", () => {
    expect(visibleAgentUserContent("总结当前笔记")).toBe("总结当前笔记");
  });

  it("extracts the user request from legacy page-context envelopes", () => {
    expect(visibleAgentUserContent([
      "以下 JSON 只描述当前页面定位；正文必须通过 read_current_context 获取。",
      '{"kind":"mewmo_page_context","targetType":"note","targetId":"note-1"}',
      "用户请求：",
      "总结当前笔记",
    ].join("\n"))).toBe("总结当前笔记");
  });

  it("does not strip similar user-authored text without a complete envelope", () => {
    expect(visibleAgentUserContent("以下 JSON 只描述当前页面定位；正文必须通过 read_current_context 获取。"))
      .toBe("以下 JSON 只描述当前页面定位；正文必须通过 read_current_context 获取。");
  });
});
