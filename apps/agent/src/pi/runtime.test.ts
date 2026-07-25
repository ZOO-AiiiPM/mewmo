import { describe, expect, it } from "vitest";

import { AgentError } from "../errors";
import { assertAgentResponseSucceeded } from "./runtime";

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
