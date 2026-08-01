import { describe, expect, it } from "vitest";

import { createThinkTagStreamFilter, stripThinkTags } from "./think-tags";

describe("stripThinkTags", () => {
  it("returns plain text untouched", () => {
    expect(stripThinkTags("hello world")).toBe("hello world");
  });

  it("removes a leading think block and following whitespace", () => {
    expect(stripThinkTags("<think>secret reasoning</think>\n\nok")).toBe("ok");
  });

  it("removes multiple think blocks", () => {
    expect(stripThinkTags("<think>a</think>one<think>b</think>two")).toBe("onetwo");
  });

  it("removes an unclosed trailing think block", () => {
    expect(stripThinkTags("answer<think>cut off by max_tokens")).toBe("answer");
  });
});

describe("createThinkTagStreamFilter", () => {
  const run = (chunks: string[]) => {
    const filter = createThinkTagStreamFilter();
    return chunks.map(filter).join("");
  };

  it("passes through plain deltas", () => {
    expect(run(["hello ", "world"])).toBe("hello world");
  });

  it("drops think content within a single delta", () => {
    expect(run(["<think>reasoning</think>\n\nok"])).toBe("ok");
  });

  it("drops think content spread across deltas", () => {
    expect(run(["<think>The", " user asks...", "</think>\n\nok"])).toBe("ok");
  });

  it("handles tags split across chunk boundaries", () => {
    expect(run(["<th", "ink>secret</th", "ink>", "\nvisible"])).toBe("visible");
  });

  it("does not swallow text that merely looks like a tag prefix", () => {
    expect(run(["a < b", " and c"])).toBe("a < b and c");
  });

  it("emits nothing for an unclosed think block", () => {
    expect(run(["<think>never closed"])).toBe("");
  });
});
