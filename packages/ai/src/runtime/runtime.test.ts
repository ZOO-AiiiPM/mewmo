import { describe, expect, it } from "vitest";
import { createAIRuntime, createFakeAIRuntime } from "./runtime";
import { loadAIRuntimeConfig } from "./env";

describe("AI runtime", () => {
  it("routes multiple purposes through one Pi provider with different models", () => {
    const runtime = createAIRuntime({
      providers: { primary: { provider: "custom", apiKey: "secret", baseUrl: "https://ai.example/v1" } },
      models: {
        "agent.chat": { provider: "primary", model: "chat-model" },
        "workflow.summary": { provider: "primary", model: "summary-model" },
      },
    });

    expect(runtime.model("agent.chat")).toMatchObject({ id: "chat-model", provider: "primary" });
    expect(runtime.model("workflow.summary")).toMatchObject({ id: "summary-model", provider: "primary" });
  });

  it("validates structured output and provides deterministic fake embeddings", async () => {
    const runtime = createFakeAIRuntime({ text: JSON.stringify({ title: "Result" }), embeddings: [[0.1, 0.2]] });
    const generated = await runtime.generateObject({
      purpose: "workflow.recommendation",
      messages: [{ role: "user", content: "go" }],
      schema: {
        parse(value: unknown) {
          if (typeof value !== "object" || value === null || !("title" in value) || typeof value.title !== "string") {
            throw new Error("invalid object");
          }
          return { title: value.title };
        },
      },
    });
    const embedded = await runtime.embed({ purpose: "workflow.embedding", values: ["text"] });
    expect(generated.object).toEqual({ title: "Result" });
    expect(embedded.embeddings).toEqual([[0.1, 0.2]]);
  });

  it("keeps the existing model environment variables as migration fallbacks", () => {
    const config = loadAIRuntimeConfig({
      AI_PROVIDER: "custom",
      CUSTOM_AI_API_KEY: "secret",
      CUSTOM_AI_BASE_URL: "https://ai.example/v1",
      AI_CHAT_MODEL: "legacy-chat",
      AI_SUMMARY_MODEL: "legacy-summary",
      AI_EMBEDDING_MODEL: "legacy-embedding",
    });
    expect(config.models).toMatchObject({
      "agent.chat": { model: "legacy-chat" },
      "agent.deep_insight": { model: "legacy-chat" },
      "workflow.summary": { model: "legacy-summary" },
      "workflow.embedding": { model: "legacy-embedding" },
    });
  });
});
