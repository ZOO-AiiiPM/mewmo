import { describe, expect, it } from "vitest";

import { loadAgentConfig } from "./config";

const required = {
  AGENT_IDENTITY_SECRET: "test-secret-that-is-at-least-thirty-two-characters",
};

describe("loadAgentConfig Langfuse settings", () => {
  it("keeps tracing disabled when both keys are absent", () => {
    const config = loadAgentConfig({
      ...required,
      LANGFUSE_PUBLIC_KEY: "",
      LANGFUSE_SECRET_KEY: "",
    });
    expect(config.LANGFUSE_PUBLIC_KEY).toBeUndefined();
    expect(config.LANGFUSE_SECRET_KEY).toBeUndefined();
  });

  it("keeps a partial Langfuse credential available for fail-open adapter validation", () => {
    const secret = "secret-value-must-not-appear";
    const config = loadAgentConfig({
      ...required,
      LANGFUSE_SECRET_KEY: secret,
    });
    expect(config.LANGFUSE_SECRET_KEY).toBe(secret);
    expect(config.LANGFUSE_PUBLIC_KEY).toBeUndefined();
  });

  it("accepts an explicit environment and release", () => {
    const config = loadAgentConfig({
      ...required,
      LANGFUSE_PUBLIC_KEY: "pk-test",
      LANGFUSE_SECRET_KEY: "sk-test",
      LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
      LANGFUSE_ENVIRONMENT: "development",
      LANGFUSE_RELEASE: "commit-123",
    });
    expect(config).toMatchObject({
      LANGFUSE_ENVIRONMENT: "development",
      LANGFUSE_RELEASE: "commit-123",
    });
  });
});
