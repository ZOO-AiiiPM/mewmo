// 多会话历史持久化（localStorage，demo 阶段；后续可迁 SQLite）
// 设计动机：流式 streaming 时频繁触碰 localStorage 会卡，所以只在每次 send 完成后 sync 一次。

export type Role = 'user' | 'assistant';
export type ToolStatus = 'running' | 'done' | 'error';
export type ToolUse = { name: string; status: ToolStatus };

export type AIMessage = {
  role: Role;
  content: string;
  tools?: ToolUse[];
};

export type Conversation = {
  id: string;
  title: string;
  messages: AIMessage[];
  created_at: number;
  updated_at: number;
};

const KEY = 'vibe_ai_conversations';

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (e) {
    console.error('[conv] save failed', e);
  }
}

export function newConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 用第一条 user 消息的前 30 字做标题；没有就回落"新对话"
export function makeTitle(messages: AIMessage[]): string {
  const first = messages.find(m => m.role === 'user');
  if (!first) return '新对话';
  const t = first.content.replace(/\s+/g, ' ').trim().slice(0, 30);
  return t || '新对话';
}
