"use client";

import { createContext, useEffect, useMemo, useState, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PrototypeIcon, type PrototypeIconName } from "./PrototypeIcon";

export type AISidebarContentContext =
  | { kind: "clip"; id: string; title: string; sourceLabel: string; summary: string | null }
  | { kind: "feed_entry"; id: string; title: string; sourceLabel: string; summary: string | null }
  | { kind: "note"; id: string; title: string; sourceLabel: string; summary: string | null };

interface AISidebarContextValue {
  contentContext: AISidebarContentContext | null;
  setContentContext: (context: AISidebarContentContext | null) => void;
}

const AISidebarContext = createContext<AISidebarContextValue | null>(null);

export function AISidebarProvider({ children }: { children: ReactNode }) {
  const [contentContext, setContentContext] = useState<AISidebarContentContext | null>(null);
  const value = useMemo(() => ({ contentContext, setContentContext }), [contentContext]);

  return <AISidebarContext.Provider value={value}>{children}</AISidebarContext.Provider>;
}

export function useAISidebarContext() {
  const context = useContext(AISidebarContext);
  if (!context) {
    throw new Error("useAISidebarContext must be used inside AISidebarProvider");
  }
  return context;
}

export function AISidebar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { contentContext } = useAISidebarContext();
  const [activeTab, setActiveTab] = useState<"summary" | "chat">("summary");

  return (
    <aside className={`mewmo-ai-rail ${open ? "mewmo-ai-rail--open" : ""}`} aria-hidden={!open}>
      <div className="mewmo-ai-rail__head">
        <div className="mewmo-ai-rail__mark" aria-hidden="true">
          <PrototypeIcon name="mewmo-logo" size={18} />
        </div>
        <div>
          <div className="mewmo-ai-rail__name">mewmo</div>
        </div>
        <button type="button" className="mewmo-icon-button" onClick={() => onOpenChange(false)} aria-label="关闭 mewmo">
          <PrototypeIcon name="close" size={19} className="mewmo-icon-close" />
        </button>
      </div>

      <div className="mewmo-ai-rail__tabs" role="tablist" aria-label="mewmo">
        <button
          type="button"
          className={`mewmo-ai-rail__tab ${activeTab === "summary" ? "mewmo-ai-rail__tab--active" : ""}`}
          onClick={() => setActiveTab("summary")}
          role="tab"
          aria-selected={activeTab === "summary"}
          aria-label="查看智能总结"
        >
          <PrototypeIcon name="spark" size={17} filled />
        </button>
        <button
          type="button"
          className={`mewmo-ai-rail__tab ${activeTab === "chat" ? "mewmo-ai-rail__tab--active" : ""}`}
          onClick={() => setActiveTab("chat")}
          role="tab"
          aria-selected={activeTab === "chat"}
          aria-label="打开对话"
        >
          <PrototypeIcon name="chat" size={17} filled />
        </button>
      </div>

      <div className="mewmo-ai-rail__body">
        {activeTab === "summary" ? (
          <SummaryPanel context={contentContext} />
        ) : (
          <ChatPanel context={contentContext} />
        )}
      </div>
    </aside>
  );
}

function Message({ from, children }: { from: "assistant" | "user"; children: ReactNode }) {
  return <div className={`mewmo-ai-message mewmo-ai-message--${from}`}>{children}</div>;
}

function SummaryPanel({
  context,
}: {
  context: AISidebarContentContext | null;
}) {
  const [copied, setCopied] = useState(false);
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>("idle");
  const [summaryOverride, setSummaryOverride] = useState<string | null>(null);
  const [selectedRelated, setSelectedRelated] = useState<RelatedPlaceholder | null>(null);
  const persistedSummary = normalizeSummaryText(context?.summary ?? null);
  const summary = summaryOverride ?? persistedSummary;
  const summaryKey = `${context?.kind ?? "none"}:${context?.id ?? "none"}:${persistedSummary}`;

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    setCopied(false);
    setSummaryOverride(null);
    setSummaryStatus("idle");
    setSelectedRelated(null);
  }, [summaryKey]);

  useEffect(() => {
    if (!selectedRelated) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedRelated(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedRelated]);

  if (!context || context.kind === "note") {
    return (
      <div className="mewmo-ai-summary-empty">
        <PrototypeIcon name="spark" size={22} />
        <strong>选择剪藏或订阅文章</strong>
        <p>自动总结只针对剪藏和订阅文章展示。笔记内容会频繁修改，暂不进入这里。</p>
      </div>
    );
  }

  const isGenerating = summaryStatus === "generating";
  const isFailed = summaryStatus === "failed";
  const copySummary = async () => {
    if (!summary || isGenerating || isFailed) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const regenerateSummary = async () => {
    if (isGenerating) return;
    setCopied(false);
    setSummaryStatus("generating");
    try {
      const response = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: context.kind, targetId: context.id }),
      });
      const data = (await response.json().catch(() => null)) as { summary?: unknown } | null;
      if (!response.ok || typeof data?.summary !== "string") {
        throw new Error("Failed to generate summary");
      }
      setSummaryOverride(normalizeSummaryText(data.summary));
      setSummaryStatus("idle");
    } catch {
      setSummaryOverride("");
      setSummaryStatus("failed");
    }
  };
  const regenerateLabel = summary ? "重新生成总结" : "生成总结";

  return (
    <>
      <section className="mewmo-ai-section">
        <div className="mewmo-ai-section__head">
          <h3>智能总结</h3>
          <div className="mewmo-ai-section__tools" aria-label="总结快捷操作">
            <button
              type="button"
              onClick={() => void copySummary()}
              disabled={!summary || isGenerating || isFailed}
              aria-label={copied ? "已复制" : "复制总结"}
              title="复制总结"
            >
              <PrototypeIcon name={copied ? "check" : "copy-plain"} size={12} />
            </button>
            <button
              type="button"
              onClick={() => void regenerateSummary()}
              aria-label={regenerateLabel}
              title={regenerateLabel}
            >
              <PrototypeIcon name="sync" size={12} className={isGenerating ? "mewmo-ai-section__spin" : ""} />
            </button>
          </div>
        </div>
        <div className="mewmo-ai-summary-card">
          {isFailed ? (
            <div className="mewmo-ai-summary-card__empty mewmo-ai-summary-card__empty--error">
              <strong>生成失败</strong>
              <span>请稍后重新生成。</span>
            </div>
          ) : isGenerating && !summary ? (
            <div className="mewmo-ai-summary-card__loading" aria-label="正在生成总结">
              <span />
              <span />
              <span />
            </div>
          ) : summary ? (
            <p>{summary}</p>
          ) : (
            <div className="mewmo-ai-summary-card__empty">
              <strong>还没有自动总结</strong>
              <span>后台总结完成后会显示在这里。</span>
            </div>
          )}
        </div>
      </section>

      <section className="mewmo-ai-section">
        <div className="mewmo-ai-section__head">
          <h3>相关内容</h3>
          <span>3 条</span>
        </div>
        <div className="mewmo-ai-related-list">
          {RELATED_PLACEHOLDERS.map((item) => (
            <button
              type="button"
              className="mewmo-ai-related-card"
              key={item.title}
              onClick={() => setSelectedRelated(item)}
              aria-label={`查看相关内容：${item.title}`}
            >
              <div className="mewmo-ai-related-card__type">
                <PrototypeIcon name={item.icon} size={13} />
                <span>{item.type}</span>
              </div>
              <h4>{item.title}</h4>
              <p>{item.reason}</p>
              <div className="mewmo-ai-related-card__chips">
                {item.chips.map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </section>

      <RelatedDetailModal item={selectedRelated} onClose={() => setSelectedRelated(null)} />
    </>
  );
}

function ChatPanel({ context }: { context: AISidebarContentContext | null }) {
  const [chat, setChat] = useState<AgentChat | null>(null);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sending" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;

    async function loadDefaultChat() {
      setStatus("loading");
      try {
        const response = await fetch("/api/agent/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ default: true }),
        });
        const data = (await response.json().catch(() => null)) as { chat?: AgentChat } | null;
        if (!response.ok || !data?.chat || cancelled) throw new Error("Failed to load chat");
        setChat(data.chat);
        setMessages(normalizeAgentMessages(data.chat.messages ?? []));
        setStatus("idle");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    }

    void loadDefaultChat();
    return () => {
      cancelled = true;
    };
  }, []);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || !chat || status === "sending") return;

    const localUserMessage: AgentChatMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content,
      status: "completed",
    };
    const localAssistantMessage: AgentChatMessage = {
      id: `local-assistant-${Date.now()}`,
      role: "assistant",
      content: "正在思考...",
      status: "pending",
    };
    setInput("");
    setMessages((current) => [...current, localUserMessage, localAssistantMessage]);
    setStatus("sending");

    try {
      const response = await fetch(`/api/agent/chats/${chat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          context: context ? { targetType: context.kind, targetId: context.id } : null,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        userMessage?: AgentChatMessage;
        assistantMessage?: AgentChatMessage;
      } | null;
      if (!data?.assistantMessage) throw new Error("Failed to send message");
      const assistantMessage = data.assistantMessage;

      setMessages((current) => [
        ...current.filter((message) => message.id !== localUserMessage.id && message.id !== localAssistantMessage.id),
        ...(data.userMessage ? [data.userMessage] : [localUserMessage]),
        assistantMessage,
      ]);
      setStatus(response.ok ? "idle" : "failed");
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === localAssistantMessage.id
            ? { ...message, content: "生成失败，请稍后重试。", status: "failed" }
            : message,
        ),
      );
      setStatus("failed");
    }
  };

  return (
    <>
      {messages.length === 0 && (
        <Message from="assistant">
          可以围绕当前内容继续问，也可以切换到其他文章或笔记后继续使用同一个会话。
        </Message>
      )}
      {messages.map((message) => (
        <Message key={message.id} from={message.role === "user" ? "user" : "assistant"}>
          {message.content}
        </Message>
      ))}
      {status === "failed" && messages.length === 0 && (
        <Message from="assistant">会话加载失败，请稍后重试。</Message>
      )}
      <form
        className="mewmo-ai-rail__ask"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={context ? `询问当前${contextLabel(context.kind)}` : "询问 mewmo"}
          disabled={!chat || status === "loading" || status === "sending"}
        />
        <button type="submit" disabled={!input.trim() || !chat || status === "loading" || status === "sending"} aria-label="发送">
          <PrototypeIcon name="send" size={14} />
        </button>
      </form>
    </>
  );
}

function RelatedDetailModal({
  item,
  onClose,
}: {
  item: RelatedPlaceholder | null;
  onClose: () => void;
}) {
  if (!item || typeof document === "undefined") return null;

  return createPortal(
    <div className="mewmo-ai-related-modal" role="dialog" aria-modal="true" aria-labelledby="mewmo-ai-related-title">
      <button
        type="button"
        className="mewmo-ai-related-modal__scrim"
        aria-label="关闭相关内容详情"
        onClick={onClose}
      />
      <section className="mewmo-ai-related-modal__panel">
        <header className="mewmo-ai-related-modal__head">
          <div>
            <span className="mewmo-ai-related-modal__type">
              <PrototypeIcon name={item.icon} size={14} />
              {item.type}
            </span>
            <h3 id="mewmo-ai-related-title">{item.title}</h3>
          </div>
          <button type="button" className="mewmo-ai-related-modal__close" aria-label="关闭" onClick={onClose}>
            <PrototypeIcon name="close" size={19} className="mewmo-icon-close" />
          </button>
        </header>
        <div className="mewmo-ai-related-modal__body">
          <p className="mewmo-ai-related-modal__reason">{item.reason}</p>
          {item.content.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}

const RELATED_PLACEHOLDERS = [
  {
    type: "笔记",
    icon: "note",
    title: "产品定位：一只猫的陪伴感从哪来",
    reason: "都在讨论 AI 产品从工具关系走向陪伴关系，以及这种转变对留存的影响。",
    chips: ["主题重叠", "可补充"],
    content: [
      "这条笔记讨论的是 AI 产品如何从一个外置工具变成稳定陪伴。它强调，真正影响留存的不是功能数量，而是用户每次打开产品时是否感到自己的上下文被理解、被延续。",
      "笔记里提到，陪伴感不是通过大段主动提醒制造出来的，而是通过低打扰、准确时机和可解释的关联慢慢建立。系统应该少说话，但在说话时足够贴近用户当下正在处理的问题。",
      "它和当前文章的关联点在于：两者都指向一个产品判断，AI 的价值不只是总结内容，而是帮助用户在已有材料中重新发现线索，并把这些线索变成下一步行动。",
      "如果后续做真正的关联能力，这条笔记适合作为“产品体验/留存/陪伴式 AI”这一组主题的核心锚点。它可以和剪藏、订阅文章、会议笔记一起组成一个跨来源的小知识簇。",
    ],
  },
  {
    type: "剪藏 · Stratechery",
    icon: "bookmark",
    title: "The Rise of the AI-Native Note App",
    reason: "同样关注 AI 原生笔记如何理解用户资料库，适合作为这篇文章的外部参照。",
    chips: ["同领域", "英文来源"],
    content: [
      "这篇剪藏关注 AI 原生笔记应用的界面变化：笔记不再只是被保存、搜索和分类，而是被系统持续理解。文章认为，真正有竞争力的产品会把用户资料库变成可推理的上下文层。",
      "它提到，传统笔记软件强调输入效率和组织方式，而 AI 原生应用更强调连接、重组和面向问题的提取。用户并不总是知道该搜索什么，因此系统需要主动暴露可能相关的内容。",
      "和当前文章的关系在于，它提供了一个更行业化的参照：如果 mewmo 要做关联能力，不应该只做“相似文章列表”，而应该解释为什么相关，以及这条内容能补充当前阅读的哪个角度。",
      "在真实产品里，这类剪藏可以作为外部观点来源。它能帮助用户把自己的笔记和公开讨论放在一起比较，避免知识库变成只有个人片段的封闭空间。",
    ],
  },
  {
    type: "订阅 · 少数派",
    icon: "doc",
    title: "AI 工具的祛魅时刻",
    reason: "从用户真实留存和日常使用频率切入，可以补足当前文章里的产品判断。",
    chips: ["留存", "近期阅读"],
    content: [
      "这篇订阅文章讨论 AI 工具从新鲜感走向日常使用后的落差。文章关注的是用户为什么在早期觉得惊艳，却很快回到原来的工作方式，甚至完全停止使用。",
      "它将问题拆成几个层面：工具是否真的进入既有流程，是否减少了重复劳动，是否能在用户没有明确指令时提供有用帮助，以及是否避免了过度打扰。",
      "它和当前内容的关联在于，两者都可以支撑一个判断：AI 功能不能只停在演示效果上。总结、关联、对话都要服务于用户真实的阅读和整理流程，否则很容易变成偶尔尝鲜的功能。",
      "后续如果实现真实关联，可以把这类订阅文章标记为“趋势/反思/用户行为”类型。它不一定直接给出功能方案，但能帮助判断某个 AI 功能是否值得做，以及应该避免哪些过度设计。",
    ],
  },
] satisfies Array<{
  type: string;
  icon: PrototypeIconName;
  title: string;
  reason: string;
  chips: string[];
  content: string[];
}>;

type RelatedPlaceholder = (typeof RELATED_PLACEHOLDERS)[number];

type SummaryStatus = "idle" | "generating" | "failed";

interface AgentChat {
  id: string;
  title: string;
  messages?: AgentChatMessage[];
}

interface AgentChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  status?: "pending" | "completed" | "failed" | "cancelled";
}

function normalizeAgentMessages(messages: AgentChatMessage[]) {
  return messages.filter((message) => message.role === "user" || message.role === "assistant");
}

function normalizeSummaryText(summary: string | null) {
  return summary?.trim().replace(/(?:\s*(?:\.{3,}|…|⋯))+$/u, "") ?? "";
}

function contextLabel(kind: AISidebarContentContext["kind"]) {
  if (kind === "clip") return "剪藏";
  if (kind === "feed_entry") return "订阅文章";
  return "笔记";
}
