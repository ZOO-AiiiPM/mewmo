/**
 * Cat agent —— LLM 调用编排（手动触发场景，不做错误重试 / Skill 集成 / 自动化）
 *
 * 复用现有基础设施：
 * - ai-sdk `generateText` 单次调用（写日报 / 总结当前文章等场景）
 * - `createOpenAIProvider` 来自 ../ai/client.ts（前端直连 OpenAI 兼容，用户运行时配置）
 *
 * Persona inject 协议（spec FR-018）：每次调用前重读 vault 内 .mewmo/cat/* 不缓存
 */

import { generateText } from 'ai';
import { createOpenAIProvider, hasApiKey, loadAISettings } from '../ai/client';
import { loadActivePersona, type CatPersona } from './persona';

export type CatScenario = 'ingest-feedback' | 'query' | 'daily-report' | 'inspect-current' | 'inspect-vault';

export type CatRequest = {
  scenario: CatScenario;
  /** 用户输入或上下文（猫看到的素材：当前笔记内容 / 今日活动日志 / vault 文件列表 等） */
  context: string;
  /** 输出长度上限。默认 400 字（POC-6 推出），日报场景可放宽到 800 字 */
  maxLength?: number;
};

export type CatResponse = {
  /** LLM 输出文本 */
  text: string;
  /** 当时使用的 persona id（让 caller 能写到日报 frontmatter / log 里） */
  personaId: string;
  /** 当时使用的 persona name */
  personaName: string;
};

/**
 * 让猫做一件事
 *
 * 失败抛错（caller 用 try/catch 捕获 + 给用户 toast 提示）。本函数不做重试 / 错误恢复——
 * 按用户指示「不做错误处理」，错误处理留 Phase 1+ 单独讨论。
 */
export async function askCat(req: CatRequest): Promise<CatResponse> {
  const settings = loadAISettings();
  if (!hasApiKey(settings)) {
    throw new Error('请先在 AI 面板（顶部 ✨ 图标）配置 API key');
  }

  // 不缓存——每次重读 vault 内 persona / voice 文件（POC-3 防跳戏）
  const persona = await loadActivePersona();

  const provider = createOpenAIProvider(settings);
  const systemPrompt = buildSystemPrompt(persona, req.scenario, req.maxLength ?? 400);

  const result = await generateText({
    model: provider(settings.model),
    system: systemPrompt,
    prompt: req.context,
  });

  return {
    text: result.text,
    personaId: persona.id,
    personaName: persona.name,
  };
}

function buildSystemPrompt(persona: CatPersona, scenario: CatScenario, maxLength: number): string {
  return `你是 mewmo 里的一只猫，名字是「${persona.name}」。下面是你的性格设定 + 说话风格：

${persona.content}

---

下面是你在不同场景下应该用的语气模板（仅参考，不要照抄）：

${persona.voiceTemplate}

---

当前场景：${describeScenario(scenario)}

输出要求：
- **严格用猫的视角说话**——"我看了..." / "我帮你..." / "今天我观察到..."；**禁止**用 "AI 摘要：" / "已生成报告" / "用户" 这类工具语言或第三人称
- 中文为主
- 长度上限 ${maxLength} 字
- 不需要 markdown 大标题（# / ##），直接说话；可以用列表 / 短段落
- 如果场景允许，可以用一两个颜文字或 emoji 点缀，但不要堆砌
`;
}

function describeScenario(scenario: CatScenario): string {
  const map: Record<CatScenario, string> = {
    'ingest-feedback': '用户刚 ingest 了一段内容，给一句简短反馈',
    query: '回答用户问的关于 vault 内容的问题',
    'daily-report': '一天结束时写一篇日报——用猫的视角观察用户今天看了什么、写了什么、整理了什么。可以提到具体笔记 / 剪藏标题，但不要罗列；要让用户感觉到"猫真的在看着我"',
    'inspect-current': '看了用户当前打开的笔记 / 剪藏，给一段关于这篇内容的猫式观察 / 联想（不是机械总结）',
    'inspect-vault': '扫了一遍 vault 当前内容，对用户最近的关注做一段简短描述',
  };
  return map[scenario];
}
