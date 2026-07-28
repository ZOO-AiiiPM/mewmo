"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { waitForAiRun } from "../../lib/ai-workflow-client";
import { useAgentChats } from "../../lib/agent/use-agent-chats";
import { AgentSidebar } from "../agent/AgentSidebar";
import { ChatSwitcher } from "../agent/ChatSwitcher";
import { PrototypeIcon } from "./PrototypeIcon";

export interface AgentNoteDraftPatch {
  noteId: string;
  baseVersion: number;
  title?: string;
  content?: string;
}

export type AISidebarContentContext =
  | { kind: "clip"; id: string; title: string; sourceLabel: string; summary: string | null }
  | { kind: "feed_entry"; id: string; title: string; sourceLabel: string; summary: string | null }
  | {
      kind: "note";
      id: string;
      title: string;
      sourceLabel: string;
      summary: string | null;
      draft: { baseVersion: number; title: string; content: string };
      applyDraftPatch?: (patch: AgentNoteDraftPatch) => Promise<{ version?: number }>;
    };

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
  if (!context) throw new Error("useAISidebarContext must be used inside AISidebarProvider");
  return context;
}

export function AISidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { contentContext } = useAISidebarContext();
  const [activeTab, setActiveTab] = useState<"summary" | "agent">("agent");
  const [requestedSkill, setRequestedSkill] = useState<string | null>(null);
  const agentChats = useAgentChats();

  const openDeepInsight = () => {
    setActiveTab("agent");
    setRequestedSkill("deep-insight");
  };

  return (
    <aside className={`mewmo-ai-rail ${open ? "mewmo-ai-rail--open" : ""}`} aria-hidden={!open}>
      <div className="mewmo-ai-rail__head">
        <div className="mewmo-ai-rail__mark" aria-hidden="true"><PrototypeIcon name="mewmo-logo" size={18} /></div>
        <div><div className="mewmo-ai-rail__name">mewmo</div></div>
        <div className="mewmo-ai-rail__head-actions">
          <ChatSwitcher
            chats={agentChats.chats}
            activeChatId={agentChats.activeChatId}
            loading={agentChats.loadingChats}
            locked={agentChats.store.status === "sending"}
            pendingChatId={agentChats.pendingChatId}
            onOpen={() => setActiveTab("agent")}
            onSelectChat={agentChats.selectChat}
            onRename={agentChats.renameChat}
            onClear={agentChats.clearChat}
            onDelete={agentChats.deleteChat}
          />
          <button
            type="button"
            className="mewmo-icon-button"
            onClick={() => { setActiveTab("agent"); void agentChats.newChat(); }}
            aria-label="新建会话"
            disabled={agentChats.loadingChats || agentChats.pendingChatId !== null || agentChats.store.status === "sending"}
          >
            <PrototypeIcon name="pen-new-square" size={17} />
          </button>
          <button type="button" className="mewmo-icon-button" onClick={() => onOpenChange(false)} aria-label="关闭 mewmo">
            <PrototypeIcon name="close" size={19} className="mewmo-icon-close" />
          </button>
        </div>
      </div>

      <div className="mewmo-ai-rail__tabs" role="tablist" aria-label="mewmo">
        <button type="button" className={`mewmo-ai-rail__tab ${activeTab === "summary" ? "mewmo-ai-rail__tab--active" : ""}`} onClick={() => setActiveTab("summary")} role="tab" aria-selected={activeTab === "summary"}>
          <PrototypeIcon name="spark" size={17} filled />总结
        </button>
        <button type="button" className={`mewmo-ai-rail__tab ${activeTab === "agent" ? "mewmo-ai-rail__tab--active" : ""}`} onClick={() => setActiveTab("agent")} role="tab" aria-selected={activeTab === "agent"}>
          <PrototypeIcon name="chat" size={17} filled />Agent
        </button>
      </div>

      <ContextBinding context={contentContext} onDeepInsight={openDeepInsight} />
      <div className="mewmo-ai-rail__body">
        {activeTab === "summary" ? <SummaryPanel context={contentContext} /> : (
          <AgentSidebar agentChats={agentChats} context={contentContext} requestedSkill={requestedSkill} onSkillConsumed={() => setRequestedSkill(null)} />
        )}
      </div>
    </aside>
  );
}

function ContextBinding({ context, onDeepInsight }: { context: AISidebarContentContext | null; onDeepInsight: () => void }) {
  if (!context) return <div className="mewmo-ai-rail__context"><strong>未绑定内容</strong><span>Agent 可以搜索工作区；打开内容后会自动附加当前上下文。</span></div>;
  return (
    <div className="mewmo-ai-rail__context">
      <div><span>当前{contextLabel(context.kind)}</span><strong title={context.title}>{context.title}</strong></div>
      {context.kind === "note" && <span>发送时会使用编辑器里的最新草稿</span>}
      <button type="button" onClick={onDeepInsight}><PrototypeIcon name="spark" size={13} />深度洞察</button>
    </div>
  );
}

function SummaryPanel({ context }: { context: AISidebarContentContext | null }) {
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<"idle" | "generating" | "failed">("idle");
  const [override, setOverride] = useState<string | null>(null);
  const [related, setRelated] = useState<RelatedItem[]>([]);
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [supplementalPending, setSupplementalPending] = useState(false);
  const requestSequence = useRef(0);
  const persisted = normalizeSummaryText(context?.summary ?? null);
  const summary = override ?? persisted;

  useEffect(() => {
    requestSequence.current += 1;
    setCopied(false);
    setStatus("idle");
    setOverride(null);
    setRelated([]);
    setInsights([]);
  }, [context?.id, persisted]);

  useEffect(() => {
    if (!context) return;
    let cancelled = false;
    const load = async () => {
      if (!cancelled) setSupplementalPending(true);
      try {
        const relatedResponse = await fetch(`/api/ai/related?targetType=${encodeURIComponent(context.kind)}&targetId=${encodeURIComponent(context.id)}`, { cache: "no-store" });
        const relatedData = await relatedResponse.json().catch(() => null) as { items?: unknown } | null;
        if (!cancelled && relatedResponse.ok && Array.isArray(relatedData?.items)) setRelated(relatedData.items.filter(isRelatedItem));
        if (context.kind === "note") {
          const insightResponse = await fetch(`/api/ai/insights?noteId=${encodeURIComponent(context.id)}`, { cache: "no-store" });
          const insightData = await insightResponse.json().catch(() => null) as { items?: unknown } | null;
          if (!cancelled && insightResponse.ok && Array.isArray(insightData?.items)) setInsights(insightData.items.filter(isInsightItem));
        }
      } finally {
        if (!cancelled) setSupplementalPending(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [context]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!context) return <div className="mewmo-ai-summary-empty"><PrototypeIcon name="spark" size={22} /><strong>未绑定内容</strong><p>打开一条内容后，后台结果会显示在这里。</p></div>;

  const regenerate = async () => {
    if (status === "generating" || context.kind === "note") return;
    const sequence = ++requestSequence.current;
    setStatus("generating");
    try {
      const response = await fetch("/api/ai/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: context.kind, targetId: context.id, clientRequestId: crypto.randomUUID() }) });
      const data = (await response.json().catch(() => null)) as { runId?: unknown } | null;
      if (!response.ok || typeof data?.runId !== "string") throw new Error("summary enqueue failed");
      await waitForAiRun(data.runId);
      const targetResponse = await fetch(`/api/${context.kind === "clip" ? "clips" : "feed-entries"}/${encodeURIComponent(context.id)}`, { cache: "no-store" });
      const target = await targetResponse.json().catch(() => null) as { summary?: unknown } | null;
      if (!targetResponse.ok || typeof target?.summary !== "string") throw new Error("summary result unavailable");
      if (requestSequence.current !== sequence) return;
      setOverride(normalizeSummaryText(target.summary));
      setStatus("idle");
    } catch {
      if (requestSequence.current === sequence) setStatus("failed");
    }
  };

  if (context.kind === "note") {
    return <>
      <InsightSection items={insights} pending={supplementalPending} />
      <RelatedSection items={related} pending={supplementalPending} />
      {!supplementalPending && insights.length === 0 && related.length === 0 && <div className="mewmo-ai-summary-empty"><PrototypeIcon name="spark" size={22} /><strong>洞察准备中</strong><p>笔记更新后，后台会逐步生成关联和轻量洞察。</p></div>}
    </>;
  }

  return <>
    <section className="mewmo-ai-section">
      <div className="mewmo-ai-section__head"><h3>智能总结</h3><div className="mewmo-ai-section__tools">
        <button type="button" disabled={!summary || status !== "idle"} onClick={() => void navigator.clipboard.writeText(summary).then(() => setCopied(true))} aria-label="复制总结"><PrototypeIcon name={copied ? "check" : "copy-plain"} size={12} /></button>
        <button type="button" onClick={() => void regenerate()} aria-label="重新生成总结"><PrototypeIcon name="sync" size={12} className={status === "generating" ? "mewmo-ai-section__spin" : ""} /></button>
      </div></div>
      <div className="mewmo-ai-summary-card">{status === "failed" ? <div className="mewmo-ai-summary-card__empty mewmo-ai-summary-card__empty--error"><strong>生成失败</strong><span>请稍后重试。</span></div> : summary ? <p>{summary}</p> : status === "generating" ? <div className="mewmo-ai-summary-card__loading"><span /><span /><span /></div> : <div className="mewmo-ai-summary-card__empty"><strong>还没有自动总结</strong><span>后台处理完成后会显示在这里。</span></div>}</div>
    </section>
    <RelatedSection items={related} pending={supplementalPending} />
  </>;
}

interface RelatedItem {
  targetType: "note" | "clip" | "feed_entry";
  targetId: string;
  title: string;
  excerpt: string | null;
  score: number;
  href: string;
}

interface InsightItem {
  id: string;
  kind: string;
  content: string;
  inputVersion: number;
}

function RelatedSection({ items, pending }: { items: RelatedItem[]; pending: boolean }) {
  if (!pending && items.length === 0) return null;
  return <section className="mewmo-ai-section">
    <div className="mewmo-ai-section__head"><h3>相关推荐</h3></div>
    {pending && items.length === 0 ? <div className="mewmo-ai-summary-card__loading"><span /><span /><span /></div> : <div className="mewmo-ai-related-list">
      {items.map((item) => <a className="mewmo-ai-related-card" href={item.href} key={`${item.targetType}:${item.targetId}`}>
        <span className="mewmo-ai-related-card__type"><PrototypeIcon name={relatedIcon(item.targetType)} size={12} />{relatedLabel(item.targetType)} · {Math.round(item.score * 100)}%</span>
        <h4>{item.title}</h4>
        {item.excerpt && <p>{item.excerpt}</p>}
      </a>)}
    </div>}
  </section>;
}

function InsightSection({ items, pending }: { items: InsightItem[]; pending: boolean }) {
  if (!pending && items.length === 0) return null;
  return <section className="mewmo-ai-section">
    <div className="mewmo-ai-section__head"><h3>轻量洞察</h3></div>
    {pending && items.length === 0 ? <div className="mewmo-ai-summary-card__loading"><span /><span /><span /></div> : <div className="mewmo-ai-insight-list">
      {items.map((item) => <article className="mewmo-ai-insight-item" key={item.id}><span>{insightLabel(item.kind)}</span><p>{item.content}</p></article>)}
    </div>}
  </section>;
}

function isRelatedItem(value: unknown): value is RelatedItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (item.targetType === "note" || item.targetType === "clip" || item.targetType === "feed_entry")
    && typeof item.targetId === "string" && typeof item.title === "string" && typeof item.score === "number" && typeof item.href === "string";
}

function isInsightItem(value: unknown): value is InsightItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.kind === "string" && typeof item.content === "string" && typeof item.inputVersion === "number";
}

function relatedIcon(type: RelatedItem["targetType"]) { return type === "note" ? "note" : type === "feed_entry" ? "rss" : "bookmark"; }
function relatedLabel(type: RelatedItem["targetType"]) { return type === "note" ? "笔记" : type === "feed_entry" ? "订阅" : "剪藏"; }
function insightLabel(kind: string) { return ({ completeness: "完整性", duplicate_viewpoint: "重复视角", viewpoint_change: "观点变化" } as Record<string, string>)[kind] ?? "洞察"; }

function normalizeSummaryText(summary: string | null) { return summary?.trim().replace(/(?:\s*(?:\.{3,}|…|⋯))+$/u, "") ?? ""; }
function contextLabel(kind: AISidebarContentContext["kind"]) { if (kind === "clip") return "剪藏"; if (kind === "feed_entry") return "订阅文章"; return "笔记"; }
