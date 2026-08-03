import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AssistantRow ordered process presentation wiring", () => {
  it("renders an ordered collapsible process and a separate final region", () => {
    const source = readFileSync("apps/web/src/components/agent/AssistantRow.tsx", "utf8");

    expect(source).toContain("assistantPresentation(row.assistant, reconcileCompletedTurn)");
    expect(source).not.toContain("ToolGroup");
    expect(source).toContain('<details className={`mewmo-thinking-region');
    expect(source).toContain('final ? "mewmo-final-answer" : "mewmo-process-narration"');
    expect(source).toContain('className="mewmo-process-thinking"');
    expect(source).toContain('hasFinal={presentation.finalBlocks.some((block) => block.kind === "text")}');
    expect(source).toContain('hasFinal ? "mewmo-thinking-region--with-final" : ""');
    expect(source.indexOf('name="caret"')).toBeLessThan(source.indexOf("processSummary(row)"));
    expect(source).toContain('name="bulb"');
    expect(source).toContain('streaming ? "深度思考中" : "思考过程"');
    expect(source).toContain("blocks.some(isProcessBlock)");
    expect(source).toContain("isProcessBlock(block)");
    expect(source).toContain("reconcileCompletedTurn && presentation.processBlocks.length > 0");
  });

  it("gives the process a bounded, internally scrollable region as a layout contract", () => {
    const css = readFileSync("apps/web/src/app/globals.css", "utf8");
    const rule = css.match(/\.mewmo-thinking-region__content\s*\{([^}]+)\}/)?.[1] ?? "";

    expect(rule).toMatch(/min-height:\s*72px/);
    expect(rule).toMatch(/max-height:\s*176px/);
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(rule).toMatch(/scrollbar-gutter:\s*stable/);
  });

  it("renders public tool details directly with semantic local icons", () => {
    const tool = readFileSync("apps/web/src/components/agent/ToolBlock.tsx", "utf8");
    const icons = readFileSync("apps/web/src/components/shell/PrototypeIcon.tsx", "utf8");

    expect(tool).not.toContain("<details");
    expect(tool).not.toContain("查看详情");
    expect(tool).toContain('aria-label="工具详情"');
    expect(tool).toContain('return "magnifer-linear"');
    expect(tool).toContain('return "library"');
    expect(tool).toContain('return "sledgehammer-linear"');
    expect(icons).toContain('| "magnifer-linear"');
    expect(icons).toContain('| "sledgehammer-linear"');
  });

  it("restores unordered and ordered list markers", () => {
    const css = readFileSync("apps/web/src/app/globals.css", "utf8");
    expect(css).toMatch(/mewmo-md__list:not\(.mewmo-md__list--ordered\).*list-style:\s*disc outside/);
    expect(css).toMatch(/mewmo-md__list--ordered.*list-style:\s*decimal outside/);
    expect(css).toMatch(/mewmo-md__list > li.*display:\s*list-item/);
  });

  it("keeps the assistant column stretched and separates final content without offset patches", () => {
    const css = readFileSync("apps/web/src/app/globals.css", "utf8");
    const assistant = css.match(/\.mewmo-message-group--assistant \.mewmo-ai-message--assistant\s*\{([^}]+)\}/g)?.at(-1) ?? "";
    const process = css.match(/\.mewmo-thinking-region\s*\{([^}]+)\}/)?.[1] ?? "";
    const separator = css.match(/\.mewmo-thinking-region--with-final\s*\{([^}]+)\}/)?.[1] ?? "";

    expect(assistant).toMatch(/width:\s*100%/);
    expect(assistant).toMatch(/align-self:\s*stretch/);
    expect(process).not.toMatch(/(?:margin-left|transform|border-left):/);
    expect(separator).toMatch(/border-bottom:/);
  });

  it("uses one process type scale and limits the quote line to reasoning content", () => {
    const css = readFileSync("apps/web/src/app/globals.css", "utf8");
    const content = css.match(/\.mewmo-thinking-region__content\s*\{([^}]+)\}/)?.[1] ?? "";
    const reasoning = css.match(/\.mewmo-process-thinking__content\s*\{([^}]+)\}/)?.[1] ?? "";
    const toolLine = css.match(/\.mewmo-tool-line\s*\{([^}]+)\}/)?.[1] ?? "";
    const toolDetails = css.match(/\.mewmo-tool-details\s*\{([^}]+)\}/)?.[1] ?? "";

    for (const rule of [content, toolLine, toolDetails]) {
      expect(rule).toMatch(/color:\s*var\(--ink-soft\)/);
      expect(rule).toMatch(/font-size:\s*12px/);
      expect(rule).toMatch(/line-height:\s*1\.6/);
    }
    expect(reasoning).toMatch(/grid-column:\s*2/);
    expect(reasoning).toMatch(/border-left:/);
    expect(toolLine).not.toMatch(/border-left:/);
    expect(toolDetails).not.toMatch(/border-left:/);
  });
});
