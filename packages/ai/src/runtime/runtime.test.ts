import { describe, expect, it, vi } from "vitest";
import { createAIRuntime, createFakeAIRuntime } from "./runtime";

describe("AI runtime", () => {
  it("routes multiple purposes through one provider with different models", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "ok" } }],
    }), { status: 200 }));
    const runtime = createAIRuntime({
      providers: { primary: { provider: "custom", apiKey: "secret", baseUrl: "https://ai.example/v1", fetch: fetchMock } },
      models: {
        "agent.chat": { provider: "primary", model: "chat-model" },
        "workflow.summary": { provider: "primary", model: "summary-model" },
      },
    });

    const chat = await runtime.generateText({ purpose: "agent.chat", messages: [{ role: "user", content: "hi" }] });
    const summary = await runtime.generateText({ purpose: "workflow.summary", messages: [{ role: "user", content: "summarize" }] });

    expect(chat.model).toBe("chat-model");
    expect(summary.model).toBe("summary-model");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ model: "chat-model" });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ model: "summary-model" });
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
});
