import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Type, type Context, type Model, type ToolResultMessage, type UserMessage } from "@earendil-works/pi-ai";
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

  it("routes google relay endpoints through the native adapter with catalog pricing", () => {
    const google = createAIRuntime({
      providers: { primary: { provider: "google", apiKey: "secret", baseUrl: "https://relay.example/prefix/v1beta" } },
      models: { "agent.chat": { provider: "primary", model: "gemini-3.5-flash-lite" } },
    });
    const custom = createAIRuntime({
      providers: { primary: { provider: "custom", apiKey: "secret", baseUrl: "https://ai.example/v1" } },
      models: { "agent.chat": { provider: "primary", model: "chat-model" } },
    });

    expect(google.model("agent.chat")).toMatchObject({
      api: "google-generative-ai",
      cost: { input: 0.3, output: 2.5, cacheRead: 0.03, cacheWrite: 0 },
    });
    expect(google.modelPricing("agent.chat")).toEqual({
      known: true,
      priceSnapshot: { input: 0.3, output: 2.5, cacheRead: 0.03, cacheWrite: 0 },
    });
    expect(custom.model("agent.chat").compat).toBeUndefined();
  });

  it("preserves native google thought signatures across a tool-result replay", async () => {
    const requests: unknown[] = [];
    const server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      requests.push(JSON.parse(body));
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end(requests.length === 1
        ? googleSse({
            candidates: [{
              content: {
                role: "model",
                parts: [{
                  functionCall: { name: "read_current_context", args: {}, id: "call-1" },
                  thoughtSignature: "b3BhcXVlLXNpZ25hdHVyZQ==",
                }],
              },
              finishReason: "STOP",
            }],
            usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 3, totalTokenCount: 15 },
          })
        : googleSse({
            candidates: [{
              content: { role: "model", parts: [{ text: "DONE" }] },
              finishReason: "STOP",
            }],
            usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 1, totalTokenCount: 21 },
          }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      const address = server.address() as AddressInfo;
      const runtime = createAIRuntime({
        providers: { primary: { provider: "google", apiKey: "secret", baseUrl: `http://127.0.0.1:${address.port}/v1beta` } },
        models: { "agent.chat": { provider: "primary", model: "gemini-3.5-flash-lite" } },
      });
      const model = runtime.model("agent.chat") as Model<"google-generative-ai">;
      const user: UserMessage = { role: "user", content: "Read context, then reply DONE.", timestamp: Date.now() };
      const tools = [{ name: "read_current_context", description: "Read context.", parameters: Type.Object({}) }];
      const first = await runtime.models().complete(model, { messages: [user], tools }, {
        toolChoice: "any",
        maxRetries: 0,
      });
      const toolCall = first.content.find((block) => block.type === "toolCall");
      expect(toolCall).toMatchObject({
        type: "toolCall",
        id: "call-1",
        thoughtSignature: "b3BhcXVlLXNpZ25hdHVyZQ==",
      });
      if (!toolCall || toolCall.type !== "toolCall") throw new Error("Expected a tool call");
      const toolResult: ToolResultMessage = {
        role: "toolResult",
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: [{ type: "text", text: '{"available":true}' }],
        isError: false,
        timestamp: Date.now(),
      };
      const context: Context = { messages: [user, first, toolResult], tools };
      const second = await runtime.models().complete(model, context, { toolChoice: "auto", maxRetries: 0 });

      expect(second).toMatchObject({ stopReason: "stop", content: [{ type: "text", text: "DONE" }] });
      expect(requests).toHaveLength(2);
      expect(requests[1]).toMatchObject({
        contents: [{ role: "user" }, {
          role: "model",
          parts: [{
            functionCall: { name: "read_current_context", args: {} },
            thoughtSignature: "b3BhcXVlLXNpZ25hdHVyZQ==",
          }],
        }, {
          role: "user",
          parts: [{ functionResponse: { name: "read_current_context" } }],
        }],
      });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
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

function googleSse(body: unknown) {
  return `data: ${JSON.stringify(body)}\n\n`;
}
