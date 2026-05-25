import { createOpenAI } from '@ai-sdk/openai';

const STORAGE_KEY = 'vibe-coding.ai-settings';

export type AISettings = {
  apiKey: string;
  baseURL: string;
  model: string;
};

export const DEFAULT_MODEL = 'gpt-4.1-mini';

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { apiKey: '', baseURL: '', model: DEFAULT_MODEL };
    const parsed = JSON.parse(raw) as Partial<AISettings>;
    return {
      apiKey: parsed.apiKey?.trim() ?? '',
      baseURL: parsed.baseURL?.trim() ?? '',
      model: parsed.model?.trim() || DEFAULT_MODEL,
    };
  } catch {
    return { apiKey: '', baseURL: '', model: DEFAULT_MODEL };
  }
}

export function saveAISettings(settings: AISettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    apiKey: settings.apiKey.trim(),
    baseURL: settings.baseURL.trim(),
    model: settings.model.trim() || DEFAULT_MODEL,
  }));
}

export function hasApiKey(settings: AISettings): boolean {
  return settings.apiKey.trim().length > 0;
}

export function createOpenAIProvider(settings: AISettings) {
  return createOpenAI({
    apiKey: settings.apiKey.trim(),
    baseURL: settings.baseURL.trim() || undefined,
  });
}
