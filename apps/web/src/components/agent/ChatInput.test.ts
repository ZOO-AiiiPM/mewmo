import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ChatInput semantic icon states", () => {
  it("keeps deep insight and deep thinking icons visible through semantic theme colors", () => {
    const css = readFileSync("apps/web/src/app/globals.css", "utf8");
    const iconRule = css.match(
      /\.mewmo-chat-input__insight \.mewmo-prototype-icon,\s*\.mewmo-chat-input__thinking \.mewmo-prototype-icon\s*\{([^}]+)\}/,
    )?.[1] ?? "";
    const hoverRule = css.match(
      /\.mewmo-chat-input__insight:hover:not\(:disabled\),\s*\.mewmo-chat-input__thinking:hover:not\(:disabled\)\s*\{([^}]+)\}/,
    )?.[1] ?? "";
    const activeRule = css.match(
      /\.mewmo-chat-input__insight--active,\s*\.mewmo-chat-input__thinking--active\s*\{([^}]+)\}/,
    )?.[1] ?? "";
    const disabledRule = css.match(
      /\.mewmo-chat-input__insight:disabled,\s*\.mewmo-chat-input__thinking:disabled\s*\{([^}]+)\}/,
    )?.[1] ?? "";

    expect(iconRule).toMatch(/color:\s*var\(--ink\)/);
    expect(hoverRule).toMatch(/color:\s*var\(--ink\)/);
    expect(activeRule).toMatch(/color:\s*var\(--ink\)/);
    expect(disabledRule).toMatch(/opacity:\s*0\.55/);
  });
});
