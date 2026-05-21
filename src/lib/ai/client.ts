import { createOpenAI } from '@ai-sdk/openai';

// 仅本地桌面 demo 阶段：从 Vite 环境变量读 key。
// .env 文件里写 VITE_OPENAI_API_KEY=sk-...，.env 已 gitignore。
// 后期接 Tauri Stronghold 时把读取逻辑切到 Rust invoke 即可，调用方不用改。
const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;

// 可选自定义 baseURL（比如走 BMC / 自建中转）。不配就走官方 https://api.openai.com/v1
const baseURL = import.meta.env.VITE_OPENAI_BASE_URL as string | undefined;

export const openai = createOpenAI({
  apiKey: apiKey ?? '',
  baseURL: baseURL || undefined,
});

// 默认模型：4.1-mini 兼顾速度和 tool calling 质量。可在 .env 用 VITE_OPENAI_MODEL 覆盖。
export const DEFAULT_MODEL =
  (import.meta.env.VITE_OPENAI_MODEL as string | undefined) || 'gpt-4.1-mini';

export function hasApiKey(): boolean {
  return Boolean(apiKey && apiKey.trim().length > 0);
}
