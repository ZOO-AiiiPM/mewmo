import type { CompletionInput, ModelClient, ResolvedModelClientConfig } from "./types";

export function createAnthropicClient(config: ResolvedModelClientConfig): ModelClient {
  return {
    async complete(input: CompletionInput) {
      let response: Response;
      try {
        response = await config.fetch(`${config.baseUrl}/messages`, {
          method: "POST",
          headers: {
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": config.apiKey,
          },
          body: JSON.stringify({
            model: input.model ?? config.model,
            max_tokens: input.maxTokens ?? 2048,
            ...(input.system ? { system: input.system } : {}),
            messages: input.messages,
            temperature: input.temperature ?? 0.2,
          }),
        });
      } catch {
        throw new Error("anthropic model request failed during transport");
      }

      if (!response.ok) {
        throw new Error(`anthropic model request failed with status ${response.status}`);
      }

      const data = await readJson(response);
      const content = extractAnthropicText(data);
      if (!content) {
        throw new Error("anthropic model response did not include text");
      }
      return content;
    },
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("anthropic model response was not valid JSON");
  }
}

function extractAnthropicText(data: unknown) {
  if (!isRecord(data) || !Array.isArray(data.content)) return undefined;
  for (const item of data.content) {
    if (isRecord(item) && item.type === "text" && typeof item.text === "string") {
      const text = item.text.trim();
      if (text) return text;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
