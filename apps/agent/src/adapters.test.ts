import { DomainError } from "@mewmo/application";
import { describe, expect, it } from "vitest";

import { AgentError } from "./errors";
import { withUrlCaptureErrors } from "./adapters";

describe("URL capture error mapping", () => {
  it("replaces internal capture details with an actionable public message", async () => {
    const failure = withUrlCaptureErrors(
      async () => { throw new DomainError("invalid_state", "upstream included a private token"); },
      "请提供公开 URL。",
    );
    await expect(failure).rejects.toMatchObject({ code: "conflict", message: "请提供公开 URL。" });
    await expect(failure).rejects.not.toThrow(/private token/);
  });

  it("keeps non-capture infrastructure failures generic and retryable", async () => {
    await expect(withUrlCaptureErrors(
      async () => { throw new Error("database password leaked"); },
      "请提供公开 URL。",
    )).rejects.toEqual(expect.objectContaining<Partial<AgentError>>({
      code: "internal_error",
      message: "Agent application operation failed.",
      retryable: true,
    }));
  });
});
