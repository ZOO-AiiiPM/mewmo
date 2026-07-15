import type { CompletionInput, ModelClient, ResolvedModelClientConfig } from "./types";

export function createOpenAICompatibleClient(config: ResolvedModelClientConfig): ModelClient {
  return {
    async complete(input: CompletionInput) {
      let response: Response;
      try {
        response = await config.fetch(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: input.model ?? config.model,
            messages: [
              ...(input.system ? [{ role: "system" as const, content: input.system }] : []),
              ...input.messages,
            ],
            max_tokens: input.maxTokens ?? 2048,
            temperature: input.temperature ?? 0.2,
          }),
        });
      } catch {
        throw new Error(`${config.provider} model request failed during transport`);
      }

      if (!response.ok) {
        throw new Error(`${config.provider} model request failed with status ${response.status}`);
      }

      const data = await readJson(response, config.provider);
      const content = extractOpenAIText(data);
      if (!content) {
        throw new Error(`${config.provider} model response did not include text`);
      }
      return content;
    },
  };
}

async function readJson(response: Response, provider: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(`${provider} model response was not valid JSON`);
  }
}

function extractOpenAIText(data: unknown) {
  if (!isRecord(data) || !Array.isArray(data.choices)) return undefined;
  const choice = data.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) return undefined;
  return typeof choice.message.content === "string" ? choice.message.content.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
