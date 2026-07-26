import { describe, expect, it } from "vitest";

import { AgentError } from "../errors";
import { assertAgentResponseSucceeded, assertSafeToolConfiguration, pageContextInstruction } from "./runtime";

describe("pageContextInstruction", () => {
  it("keeps page metadata out of the persisted user prompt", () => {
    expect(pageContextInstruction({ targetType: "note", targetId: "note-1", draft: { content: "draft" } }))
      .toContain('{"kind":"mewmo_page_context","targetType":"note","targetId":"note-1","hasUnsavedDraft":true}');
    expect(pageContextInstruction(null)).not.toContain("用户请求：");
  });
});

describe("assertAgentResponseSucceeded", () => {
  it("accepts completed model responses", () => {
    expect(() => assertAgentResponseSucceeded({ stopReason: "stop" })).not.toThrow();
  });

  it("turns provider failures into retryable dependency errors", () => {
    expect(() => assertAgentResponseSucceeded({ stopReason: "error", errorMessage: "fetch failed" }))
      .toThrowError(expect.objectContaining<Partial<AgentError>>({ code: "dependency_unavailable", retryable: true }));
  });

  it("preserves rate-limit and abort semantics", () => {
    expect(() => assertAgentResponseSucceeded({ stopReason: "error", errorMessage: "provider returned 429" }))
      .toThrowError(expect.objectContaining<Partial<AgentError>>({ code: "rate_limited" }));
    expect(() => assertAgentResponseSucceeded({ stopReason: "aborted" }))
      .toThrowError(expect.objectContaining<Partial<AgentError>>({ code: "timeout" }));
  });
});

describe("assertSafeToolConfiguration", () => {
  it("accepts Mewmo domain tools", () => {
    expect(() => assertSafeToolConfiguration(
      ["content_search", "read_current_context", "note_update"],
      ["content_search", "read_current_context"],
    )).not.toThrow();
  });

  it.each(["bash", "read", "write", "edit", "grep", "find", "ls"])(
    "rejects the coding tool %s even when it is not active",
    (tool) => {
      expect(() => assertSafeToolConfiguration(["content_search", tool], ["content_search"]))
        .toThrow(/Coding tools are disabled/);
    },
  );
});
