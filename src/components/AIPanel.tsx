import { useEffect, useMemo, useRef, useState } from 'react';
import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { openai, DEFAULT_MODEL, hasApiKey } from '../lib/ai/client';
import { createTools } from '../lib/ai/tools';
import {
  loadConversations,
  saveConversations,
  newConversationId,
  makeTitle,
  type AIMessage,
  type Conversation,
  type Role,
  type ToolStatus,
  type ToolUse,
} from '../lib/ai/conversations';
import type { Note, Clip } from '../types';
import type { Zone } from './Sidebar';

type Props = {
  open: boolean;
  currentNote: Note | null;
  currentClip: Clip | null;
  zone: string;
};

type View = 'chat' | 'history';

const PANEL_WIDTH = 360;

const SUGGESTIONS = [
  '总结当前这篇的核心观点',
  '我之前有没有写过和这相关的笔记？',
  '帮我列一下最近 5 条剪藏',
];

const SYSTEM = `你是 vibe 笔记的本地 AI 助手。用户把笔记和网页剪藏存在本机 SQLite 里，你通过工具读取它们。

工作方式：
- 用户在笔记区，read_current_note 通常是第一步
- 用户在剪藏区，read_current_clip 是第一步
- 找跨笔记关联用 search_notes / list_clips 拿概要，再 read_note / read_clip 读全文
- 回答用简洁中文，结构清晰；引用笔记 / 剪藏时带上标题
- 没找到相关数据直说"没找到"，不编造`;

function describeCtx(note: Note | null, clip: Clip | null, zone: string) {
  if (zone === 'clipping') {
    return clip
      ? `用户在「剪藏」区，正在看《${clip.title}》（来自 ${clip.site_name || clip.url}）`
      : '用户在「剪藏」区，未选中剪藏';
  }
  return note
    ? `用户在「${zone}」区，正在编辑笔记《${note.title || '无标题'}》`
    : `用户在「${zone}」区，未打开笔记`;
}

export function AIPanel({ open, currentNote, currentClip, zone }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [running, setRunning] = useState(false);

  // 多会话
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [view, setView] = useState<View>('chat');

  // ref：tool execute 永远拿最新 props（用户切换笔记后 tool 自动跟进）
  const ctxRef = useRef({ currentNote, currentClip, zone });
  ctxRef.current = { currentNote, currentClip, zone };

  // tools 只构造一次，内部通过 ctxRef 读最新值
  const tools = useMemo(
    () =>
      createTools({
        getCurrentNote: () => ctxRef.current.currentNote,
        getCurrentClip: () => ctxRef.current.currentClip,
        getZone: () => ctxRef.current.zone,
      }),
    [],
  );

  // 把当前 messages 同步到对应 conversation 并 persist。
  // streaming 中频繁调会卡 localStorage，所以只在 send 完毕后调一次。
  function persistConversation(convId: string, msgs: AIMessage[]) {
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === convId);
      const now = Math.floor(Date.now() / 1000);
      let next: Conversation[];
      if (idx === -1) {
        const fresh: Conversation = {
          id: convId,
          title: makeTitle(msgs),
          messages: msgs,
          created_at: now,
          updated_at: now,
        };
        next = [fresh, ...prev];
      } else {
        const updated: Conversation = {
          ...prev[idx],
          title: prev[idx].title === '新对话' ? makeTitle(msgs) : prev[idx].title,
          messages: msgs,
          updated_at: now,
        };
        next = [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      }
      saveConversations(next);
      return next;
    });
  }

  function handleNewConversation() {
    setMessages([]);
    setActiveConvId(null);
    setInput('');
    setView('chat');
  }

  function handlePickConversation(id: string) {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    setMessages(conv.messages);
    setActiveConvId(id);
    setView('chat');
  }

  function handleDeleteConversation(id: string) {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id);
      saveConversations(next);
      return next;
    });
    if (activeConvId === id) {
      setMessages([]);
      setActiveConvId(null);
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || running) return;

    if (!hasApiKey()) {
      setMessages(prev => [
        ...prev,
        { role: 'user', content: trimmed },
        {
          role: 'assistant',
          content:
            '⚠️ 还没配 OpenAI API key。在 `app/.env` 加：\n\n`VITE_OPENAI_API_KEY=sk-...`\n\n然后重启 `pnpm tauri dev`。',
        },
      ]);
      setInput('');
      return;
    }

    // 第一次 send：分配 conversation id
    let convId = activeConvId;
    if (!convId) {
      convId = newConversationId();
      setActiveConvId(convId);
    }

    const userMsg: AIMessage = { role: 'user', content: trimmed };
    const baseAfterUser = [...messages, userMsg];
    setMessages([...baseAfterUser, { role: 'assistant', content: '', tools: [] }]);
    setInput('');
    setRunning(true);

    const history: ModelMessage[] = [
      ...messages.map(m => ({ role: m.role, content: m.content }) as ModelMessage),
      { role: 'user', content: trimmed },
    ];

    let finalSnapshot: AIMessage[] = [];
    try {
      const ctx = ctxRef.current;
      const result = streamText({
        model: openai(DEFAULT_MODEL),
        system: `${SYSTEM}\n\n当前上下文：${describeCtx(ctx.currentNote, ctx.currentClip, ctx.zone)}`,
        messages: history,
        tools,
        stopWhen: stepCountIs(8),
        onStepFinish: (step) => {
          const calls = step.toolCalls ?? [];
          if (calls.length === 0) return;
          setMessages(prev => {
            const arr = [...prev];
            const last = arr[arr.length - 1];
            if (last?.role !== 'assistant') return prev;
            arr[arr.length - 1] = {
              ...last,
              tools: [
                ...(last.tools ?? []),
                ...calls.map(tc => ({ name: tc.toolName, status: 'done' as ToolStatus })),
              ],
            };
            return arr;
          });
        },
      });

      let acc = '';
      for await (const delta of result.textStream) {
        acc += delta;
        setMessages(prev => {
          const arr = [...prev];
          const last = arr[arr.length - 1];
          if (last?.role !== 'assistant') return prev;
          arr[arr.length - 1] = { ...last, content: acc };
          return arr;
        });
      }

      // streaming 完毕，拿当前 messages 最终态
      setMessages(prev => {
        finalSnapshot = prev;
        return prev;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '请求失败';
      setMessages(prev => {
        const arr = [...prev];
        const last = arr[arr.length - 1];
        if (last?.role === 'assistant') {
          arr[arr.length - 1] = { ...last, content: `❌ ${msg}` };
        }
        finalSnapshot = arr;
        return arr;
      });
    } finally {
      setRunning(false);
      // 持久化整个对话
      if (convId && finalSnapshot.length > 0) {
        persistConversation(convId, finalSnapshot);
      }
    }
  }

  // panel 关闭时不卸载（避免丢 messages），只是隐藏
  useEffect(() => {
    if (!open) {
      // 关闭时把当前对话再 persist 一次（防止忘记）
      if (activeConvId && messages.length > 0) {
        persistConversation(activeConvId, messages);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <aside
      className={`absolute top-[14px] right-[14px] bottom-[22px] w-[280px] bg-white dark:bg-stone-900 rounded-2xl overflow-hidden flex flex-col z-10 shadow-[-3px_0_12px_-3px_rgba(0,0,0,0.08),0_4px_14px_-3px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.05)] dark:shadow-[-3px_0_12px_-3px_rgba(0,0,0,0.4),0_4px_14px_-3px_rgba(0,0,0,0.3),0_0_0_0.5px_rgba(255,255,255,0.06)] transition-[transform,opacity] duration-200 ease-out ${
        open
          ? 'translate-x-0 opacity-100'
          : 'translate-x-[calc(100%+14px)] opacity-0 pointer-events-none'
      }`}
      aria-hidden={!open}
    >
        {/* 顶栏：标题 / 视图操作。pr-12 给全局浮动 AI 关闭按钮让位 */}
        <div className="h-12 shrink-0 flex items-center justify-between px-4 select-none">
          <span className="text-[13px] font-medium text-stone-600 dark:text-stone-400">
            {view === 'history' ? '对话历史' : 'AI 助手'}
          </span>
          <div className="flex items-center gap-0.5">
            {view === 'chat' ? (
              <>
                <IconButton title="新对话" onClick={handleNewConversation} disabled={running}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </IconButton>
                <IconButton title="历史对话" onClick={() => setView('history')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                </IconButton>
              </>
            ) : (
              <IconButton title="返回对话" onClick={() => setView('chat')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </IconButton>
            )}
          </div>
        </div>

        {/* 主区 */}
        <div className="flex-1 overflow-y-auto">
          {view === 'history' ? (
            <ConversationList
              conversations={conversations}
              activeId={activeConvId}
              onPick={handlePickConversation}
              onDelete={handleDeleteConversation}
            />
          ) : messages.length === 0 ? (
            <EmptyState onPick={send} disabled={running} />
          ) : (
            <div className="px-4 py-4 space-y-5">
              {messages.map((m, i) => (
                <MessageBubble key={i} role={m.role} content={m.content} tools={m.tools} />
              ))}
            </div>
          )}
        </div>

        {/* 输入区：仅 chat 视图显示 */}
        {view === 'chat' && (
          <div className="px-3 pb-3 pt-1">
            <Composer
              value={input}
              onChange={setInput}
              onSend={() => send(input)}
              running={running}
            />
          </div>
        )}
    </aside>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="w-7 h-7 flex items-center justify-center rounded-md text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

function ConversationList({
  conversations,
  activeId,
  onPick,
  onDelete,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (conversations.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[13px] text-stone-400 dark:text-stone-500 px-6 text-center">
        还没有历史对话 ✨<br />开始一次提问就会自动保存到这里
      </div>
    );
  }
  return (
    <div className="py-2">
      {conversations.map(c => (
        <div
          key={c.id}
          onClick={() => onPick(c.id)}
          className={`group flex items-start gap-2 px-4 py-2.5 cursor-pointer transition-colors ${
            activeId === c.id
              ? 'bg-black/[0.05] dark:bg-white/[0.06]'
              : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-stone-800 dark:text-stone-200 truncate">
              {c.title}
            </div>
            <div className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">
              {formatTime(c.updated_at)} · {c.messages.length} 条
            </div>
          </div>
          <button
            onClick={e => {
              e.stopPropagation();
              if (confirm(`删除这个对话？\n\n"${c.title}"`)) onDelete(c.id);
            }}
            title="删除"
            className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-stone-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-opacity shrink-0 mt-0.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

function formatTime(ts: number) {
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function EmptyState({ onPick, disabled }: { onPick: (s: string) => void; disabled: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-5 pb-12">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-stone-800 to-stone-950 dark:from-stone-100 dark:to-stone-300 flex items-center justify-center text-white dark:text-stone-900 mb-4">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2 14 8l6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />
        </svg>
      </div>
      <h2 className="text-[17px] font-semibold text-stone-900 dark:text-stone-100 mb-1">
        你好 ✨
      </h2>
      <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-5 text-center">
        我能读你的笔记和剪藏，问我任何问题
      </p>
      <div className="w-full space-y-2">
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            disabled={disabled}
            onClick={() => onPick(s)}
            className="w-full text-left text-[13px] px-3.5 py-2.5 rounded-xl border border-black/5 dark:border-white/5 bg-white/70 dark:bg-stone-900/60 text-stone-700 dark:text-stone-200 hover:bg-white dark:hover:bg-stone-900 hover:border-black/10 dark:hover:border-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ role, content, tools }: { role: Role; content: string; tools?: ToolUse[] }) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md px-3.5 py-2 bg-stone-200/80 dark:bg-stone-800 text-[14px] leading-relaxed text-stone-900 dark:text-stone-100 whitespace-pre-wrap break-words">
          {content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5">
      <div className="w-6 h-6 shrink-0 rounded-md bg-gradient-to-br from-stone-800 to-stone-950 dark:from-stone-100 dark:to-stone-300 flex items-center justify-center text-white dark:text-stone-900 mt-0.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2 14 8l6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        {tools && tools.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {tools.map((t, i) => (
              <ToolChip key={i} name={t.name} status={t.status} />
            ))}
          </div>
        )}
        {content ? (
          <div className="text-[14px] leading-relaxed text-stone-800 dark:text-stone-200 whitespace-pre-wrap break-words">
            {content}
          </div>
        ) : (
          <div className="text-[13px] text-stone-400 dark:text-stone-500 italic">思考中…</div>
        )}
      </div>
    </div>
  );
}

function ToolChip({ name, status }: { name: string; status: ToolStatus }) {
  const dot =
    status === 'error'
      ? 'bg-red-500'
      : status === 'running'
        ? 'bg-amber-500 animate-pulse'
        : 'bg-emerald-500';
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-[11px] text-stone-600 dark:text-stone-400 font-mono">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {name}
    </span>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  running,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  running: boolean;
}) {
  const canSend = value.trim().length > 0 && !running;
  return (
    <div className="rounded-2xl bg-white dark:bg-stone-900 border border-black/10 dark:border-white/10 focus-within:border-stone-400 dark:focus-within:border-stone-600 transition-colors shadow-sm">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={running ? '思考中…' : '问点什么…'}
        rows={2}
        disabled={running}
        className="w-full resize-none px-3.5 pt-2.5 pb-1 bg-transparent text-[14px] leading-relaxed text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none disabled:opacity-60"
      />
      <div className="flex items-center justify-between px-2 pb-2">
        <button
          title="附件（暂未启用）"
          disabled
          className="w-7 h-7 flex items-center justify-center rounded-lg text-stone-400 dark:text-stone-500 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <button
          onClick={onSend}
          disabled={!canSend}
          title={running ? '生成中…' : '发送 (Enter)'}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 disabled:opacity-25 disabled:cursor-not-allowed transition-opacity"
        >
          {running ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
