/**
 * Cat persona / voice template 加载
 *
 * 不变式（spec FR-018 / POC-3）：每次调用都从 vault 重读 .mewmo/cat/active.txt + persona-*.md
 * 不缓存——长 session 防猫 voice 跳戏退回中立 AI 助手语气。
 *
 * 损坏 / 缺失时降级到内置 fallback（FR-020），不报错让 cat 不可用。
 */

import { readVault } from '../vault';

export const PERSONA_IDS = ['curious', 'gentle', 'sharp', 'casual', 'steady'] as const;
export type PersonaId = typeof PERSONA_IDS[number];

const DEFAULT_ID: PersonaId = 'curious';

const FALLBACK_PERSONA_NAME: Record<PersonaId, string> = {
  curious: '好奇',
  gentle: '温柔',
  sharp: '锐利',
  casual: '散漫',
  steady: '沉稳',
};

const FALLBACK_PERSONA_DESC: Record<PersonaId, string> = {
  curious: '对世界充满好奇，喜欢追问 why。说话偏短句，经常反问。',
  gentle: '温和体贴，关心你的感受。说话偏柔，不催促。',
  sharp: '直接犀利，看重效率。说话偏短，会指出问题。',
  casual: '随意松弛，不端着。说话偏口语，会跑题。',
  steady: '成熟克制，有耐心。说话偏中长句，不浮夸。',
};

const FALLBACK_VOICE = `## ingest 完成反馈

记下来啦。

## 错误反馈

我没法干活了，去看下设置吧。

## 主动行为开头

今天我看着你，整理了点东西。
`;

export type CatPersona = {
  id: PersonaId;
  name: string;
  /** persona-*.md 的 body（去 frontmatter） */
  content: string;
  /** voice-template.md 的 body */
  voiceTemplate: string;
};

function isPersonaId(s: string): s is PersonaId {
  return (PERSONA_IDS as readonly string[]).includes(s);
}

/**
 * 加载当前 active persona + voice template
 * 每次调用都重读 vault 内文件——不缓存（POC-3 长 session 跳戏教训）
 */
export async function loadActivePersona(): Promise<CatPersona> {
  // 1. 读 active.txt 决定哪个 persona id
  let activeId: PersonaId = DEFAULT_ID;
  try {
    const activeFile = await readVault('.mewmo/cat/active.txt');
    const trimmed = activeFile.body.trim();
    if (isPersonaId(trimmed)) {
      activeId = trimmed;
    }
  } catch (e) {
    console.warn('[cat] read active.txt failed, fallback to default:', e);
  }

  // 2. 读 persona-{id}.md
  let content = `## 性格描述\n\n${FALLBACK_PERSONA_DESC[activeId]}\n`;
  let name = FALLBACK_PERSONA_NAME[activeId];
  try {
    const result = await readVault(`.mewmo/cat/persona-${activeId}.md`);
    content = result.body || content;
    const fmName = result.frontmatter?.name as string | undefined;
    if (fmName) name = fmName;
  } catch (e) {
    console.warn(`[cat] read persona-${activeId}.md failed, fallback:`, e);
  }

  // 3. 读 voice-template.md
  let voiceTemplate = FALLBACK_VOICE;
  try {
    const result = await readVault('.mewmo/cat/voice-template.md');
    voiceTemplate = result.body || voiceTemplate;
  } catch (e) {
    console.warn('[cat] read voice-template.md failed, fallback:', e);
  }

  return { id: activeId, name, content, voiceTemplate };
}
