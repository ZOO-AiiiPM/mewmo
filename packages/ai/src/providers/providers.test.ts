import { describe, expect, it, vi } from "vitest";

import { createModelClient } from "./index";

describe("model providers", () => {
  it("calls the OpenAI chat completions endpoint", async () => {
    const fetchImpl = successfulFetch({ choices: [{ message: { content: " OpenAI reply " } }] });
    const client = createModelClient({
      provider: "openai",
      apiKey: "openai-key",
      baseUrl: "https://openai.example/v1/",
      model: "openai-model",
      fetch: fetchImpl,
    });

    const result = await client.complete({
      system: "System prompt",
      messages: [{ role: "user", content: "Hello" }],
      maxTokens: 900,
      temperature: 0.3,
    });

    expect(result).toBe("OpenAI reply");
    expect(fetchImpl).toHaveBeenCalledWith("https://openai.example/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer openai-key",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai-model",
        messages: [
          { role: "system", content: "System prompt" },
          { role: "user", content: "Hello" },
        ],
        max_tokens: 900,
        temperature: 0.3,
      }),
    });
  });

  it("treats custom providers as explicit OpenAI-compatible endpoints", async () => {
    const fetchImpl = successfulFetch({ choices: [{ message: { content: "Custom reply" } }] });
    const client = createModelClient({
      provider: "custom",
      apiKey: "custom-key",
      baseUrl: "https://relay.example/v1",
      model: "relay-model",
      fetch: fetchImpl,
    });

    await client.complete({ messages: [{ role: "user", content: "Hello relay" }] });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://relay.example/v1/chat/completions",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer custom-key",
          "Content-Type": "application/json",
        },
      }),
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: "relay-model",
      messages: [{ role: "user", content: "Hello relay" }],
    });
  });

  it("calls Anthropic with separate system and conversation messages", async () => {
    const fetchImpl = successfulFetch({ content: [{ type: "text", text: " Anthropic reply " }] });
    const client = createModelClient({
      provider: "anthropic",
      apiKey: "anthropic-key",
      baseUrl: "https://anthropic.example/v1/",
      model: "claude-model",
      fetch: fetchImpl,
    });

    const result = await client.complete({
      system: "System prompt",
      messages: [
        { role: "user", content: "Question" },
        { role: "assistant", content: "Previous answer" },
      ],
      maxTokens: 700,
      temperature: 0.1,
    });

    expect(result).toBe("Anthropic reply");
    expect(fetchImpl).toHaveBeenCalledWith("https://anthropic.example/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": "anthropic-key",
      },
      body: JSON.stringify({
        model: "claude-model",
        max_tokens: 700,
        system: "System prompt",
        messages: [
          { role: "user", content: "Question" },
          { role: "assistant", content: "Previous answer" },
        ],
        temperature: 0.1,
      }),
    });
  });

  it("rejects a custom provider without an explicit base URL before fetching", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    expect(() =>
      createModelClient({
        provider: "custom",
        apiKey: "custom-key",
        model: "relay-model",
        fetch: fetchImpl,
      }),
    ).toThrow("CUSTOM_AI_BASE_URL is required");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects explicit empty custom configuration before fetching", () => {
    const fetchImpl = vi.fn<typeof fetch>();

    expect(() =>
      createModelClient({
        provider: "custom",
        apiKey: "custom-key",
        baseUrl: "",
        model: "relay-model",
        fetch: fetchImpl,
      }),
    ).toThrow("CUSTOM_AI_BASE_URL is required");
    expect(() =>
      createModelClient({
        provider: "custom",
        apiKey: "",
        baseUrl: "https://relay.example/v1",
        model: "relay-model",
        fetch: fetchImpl,
      }),
    ).toThrow("CUSTOM_AI_API_KEY is required");
    expect(() =>
      createModelClient({
        provider: "custom",
        apiKey: "custom-key",
        baseUrl: "///",
        model: "relay-model",
        fetch: fetchImpl,
      }),
    ).toThrow("CUSTOM_AI_BASE_URL is required");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not leak secrets or response bodies in provider errors", async () => {
    const secret = "secret-api-key";
    const privateBody = "private article body";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(`upstream echoed ${secret} and ${privateBody}`, { status: 429 }),
    );
    const client = createModelClient({
      provider: "custom",
      apiKey: secret,
      baseUrl: "https://relay.example/v1",
      model: "relay-model",
      fetch: fetchImpl,
    });

    const error = await client
      .complete({ messages: [{ role: "user", content: privateBody }] })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("custom model request failed with status 429");
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toContain(privateBody);
  });

  it("does not leak rejected transport error messages", async () => {
    const secret = "secret-api-key";
    const privateBody = "private article body";
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(`network failed for ${secret}: ${privateBody}`));
    const client = createModelClient({
      provider: "custom",
      apiKey: secret,
      baseUrl: "https://relay.example/v1",
      model: "relay-model",
      fetch: fetchImpl,
    });

    const error = await client
      .complete({ messages: [{ role: "user", content: privateBody }] })
      .catch((caught: unknown) => caught);

    expect(String(error)).toContain("custom model request failed during transport");
    expect(String(error)).not.toContain(secret);
    expect(String(error)).not.toContain(privateBody);
  });

  it("rejects successful responses without text", async () => {
    const fetchImpl = successfulFetch({ choices: [{ message: {} }] });
    const client = createModelClient({
      provider: "openai",
      apiKey: "openai-key",
      model: "openai-model",
      fetch: fetchImpl,
    });

    await expect(client.complete({ messages: [{ role: "user", content: "Hello" }] })).rejects.toThrow(
      "openai model response did not include text",
    );
  });

  it("treats null and primitive JSON as responses without text", async () => {
    const openAIClient = createModelClient({
      provider: "openai",
      apiKey: "openai-key",
      model: "openai-model",
      fetch: successfulFetch(null),
    });
    const anthropicClient = createModelClient({
      provider: "anthropic",
      apiKey: "anthropic-key",
      model: "claude-model",
      fetch: successfulFetch("not-an-object"),
    });

    await expect(openAIClient.complete({ messages: [{ role: "user", content: "Hello" }] })).rejects.toThrow(
      "openai model response did not include text",
    );
    await expect(anthropicClient.complete({ messages: [{ role: "user", content: "Hello" }] })).rejects.toThrow(
      "anthropic model response did not include text",
    );
  });

  it("reports malformed provider JSON without exposing its body", async () => {
    const malformedBody = "private malformed response";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(malformedBody, { status: 200 }),
    );
    const client = createModelClient({
      provider: "custom",
      apiKey: "custom-key",
      baseUrl: "https://relay.example/v1",
      model: "relay-model",
      fetch: fetchImpl,
    });

    const error = await client
      .complete({ messages: [{ role: "user", content: "Hello" }] })
      .catch((caught: unknown) => caught);

    expect(String(error)).toContain("custom model response was not valid JSON");
    expect(String(error)).not.toContain(malformedBody);
  });
});

function successfulFetch(body: unknown) {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}
