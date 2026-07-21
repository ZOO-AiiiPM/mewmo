"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentActionProposal, AgentChatMessage, AgentMessageResponse } from "../../lib/agent-contract";
import { waitForAiRun } from "../../lib/ai-workflow-client";
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

  const openDeepInsight = () => {
    setActiveTab("agent");
    setRequestedSkill("deep-insight");
  };

  return (
    <aside className={`mewmo-ai-rail ${open ? "mewmo-ai-rail--open" : ""}`} aria-hidden={!open}>
      <div className="mewmo-ai-rail__head">
        <div className="mewmo-ai-rail__mark" aria-hidden="true"><PrototypeIcon name="mewmo-logo" size={18} /></div>
        <div><div className="mewmo-ai-rail__name">mewmo</div></div>
        <button type="button" className="mewmo-icon-button" onClick={() => onOpenChange(false)} aria-label="关闭 mewmo">
          <PrototypeIcon name="close" size={19} className="mewmo-icon-close" />
        </button>
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
          <AgentPanel context={contentContext} requestedSkill={requestedSkill} onSkillConsumed={() => setRequestedSkill(null)} />
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

interface AgentChat { id: string; title: string; messages?: AgentChatMessage[] }
interface FailedSend { clientRequestId: string; content: string; skillId?: string }

function AgentPanel({ context, requestedSkill, onSkillConsumed }: { context: AISidebarContentContext | null; requestedSkill: string | null; onSkillConsumed: () => void }) {
  const [chat, setChat] = useState<AgentChat | null>(null);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [proposals, setProposals] = useState<AgentActionProposal[]>([]);
  const [input, setInput] = useState("");
  const [skillId, setSkillId] = useState<string | undefined>();
  const [status, setStatus] = useState<"loading" | "idle" | "sending" | "failed">("loading");
  const [failedSend, setFailedSend] = useState<FailedSend | null>(null);

  useEffect(() => {
    if (!requestedSkill) return;
    setSkillId(requestedSkill);
    setInput((current) => current || "请对当前内容进行深度洞察，指出关键联系、盲点、反例和下一步思考方向。");
    onSkillConsumed();
  }, [onSkillConsumed, requestedSkill]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/agent/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ default: true }) })
      .then(async (response) => ({ response, data: await response.json().catch(() => null) as { chat?: AgentChat } | null }))
      .then(async ({ response, data }) => {
        if (!response.ok || !data?.chat || cancelled) throw new Error("load failed");
        const history = normalizeMessages(data.chat.messages ?? []);
        const restored = proposalsFromMessages(history);
        setChat(data.chat); setMessages(history); setProposals(restored); setStatus("idle");
        if (restored.length > 0) {
          const current = await Promise.all(restored.map(async (proposal) => {
            const response = await fetch(`/api/agent/actions/${encodeURIComponent(proposal.id)}`, { cache: "no-store" });
            const payload = await response.json().catch(() => null) as { action?: AgentActionProposal } | null;
            return response.ok && payload?.action ? payload.action : proposal;
          }));
          if (!cancelled) setProposals(current);
        }
      })
      .catch(() => { if (!cancelled) setStatus("failed"); });
    return () => { cancelled = true; };
  }, []);

  const performSend = useCallback(async (request: FailedSend) => {
    if (!chat) return;
    const localUserId = `local-user-${request.clientRequestId}`;
    const localAssistantId = `local-assistant-${request.clientRequestId}`;
    setMessages((current) => current.some((message) => message.id === localUserId)
      ? current.map((message) => message.id === localAssistantId ? { ...message, content: "正在思考…", status: "pending" } : message)
      : [...current, { id: localUserId, role: "user", content: request.content, status: "completed" }, { id: localAssistantId, role: "assistant", content: "正在思考…", status: "pending" }]);
    setStatus("sending"); setFailedSend(null);
    try {
      const response = await fetch(`/api/agent/chats/${chat.id}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientRequestId: request.clientRequestId, content: request.content, ...(request.skillId ? { skillId: request.skillId } : {}), context: context ? { resource: { type: context.kind, id: context.id, title: context.title }, ...(context.kind === "note" ? { draft: context.draft } : {}) } : null }),
      });
      const data = (await response.json().catch(() => null)) as (AgentMessageResponse & { error?: { message?: string } }) | null;
      if (!response.ok || !data?.assistantMessage) throw new Error(data?.error?.message ?? "send failed");
      const userMessage: AgentChatMessage = {
        id: data.userMessage.id ?? localUserId,
        role: "user",
        content: data.userMessage.content,
        status: data.userMessage.status ?? "completed",
      };
      const assistantMessage: AgentChatMessage = {
        id: data.assistantMessage.id ?? localAssistantId,
        role: "assistant",
        content: data.assistantMessage.content,
        status: data.assistantMessage.status ?? "completed",
      };
      setMessages((current) => [...current.filter((message) => message.id !== localUserId && message.id !== localAssistantId), userMessage, assistantMessage]);
      setProposals((current) => mergeProposals(current, data.proposals ?? []));
      setStatus("idle");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent 暂时不可用，请重试。";
      setMessages((current) => current.map((item) => item.id === localAssistantId ? { ...item, content: message, status: "failed" } : item));
      setFailedSend(request); setInput((current) => current || request.content); setStatus("failed");
    }
  }, [chat, context]);

  const send = () => {
    const content = input.trim();
    if (!content || !chat || status === "sending") return;
    const request = { clientRequestId: crypto.randomUUID(), content, ...(skillId ? { skillId } : {}) };
    setInput(""); setSkillId(undefined); void performSend(request);
  };

  const updateProposal = (proposal: AgentActionProposal) => setProposals((current) => mergeProposals(current, [proposal]));

  return <>
    {messages.length === 0 && <Message from="assistant">我可以搜索、创建、修改、润色、移动和整理你的内容。写操作会先展示预览，由你确认后执行。</Message>}
    {messages.map((message) => <Message key={message.id} from={message.role === "user" ? "user" : "assistant"}>{message.content}</Message>)}
    {proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} context={context} onChange={updateProposal} />)}
    {failedSend && <button type="button" className="mewmo-ai-retry" onClick={() => void performSend(failedSend)}><PrototypeIcon name="sync" size={13} />使用同一请求重试</button>}
    {skillId && <div className="mewmo-ai-skill-chip"><PrototypeIcon name="spark" size={12} />深度洞察<button type="button" onClick={() => setSkillId(undefined)} aria-label="取消深度洞察"><PrototypeIcon name="close" size={12} /></button></div>}
    <form className="mewmo-ai-rail__ask" onSubmit={(event) => { event.preventDefault(); send(); }}>
      <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={context ? `让 Agent 处理当前${contextLabel(context.kind)}` : "让 Agent 搜索或处理工作区内容"} disabled={!chat || status === "loading" || status === "sending"} rows={2} />
      <button type="submit" disabled={!input.trim() || !chat || status === "loading" || status === "sending"} aria-label="发送"><PrototypeIcon name="send" size={14} /></button>
    </form>
  </>;
}

function ProposalCard({ proposal, context, onChange }: { proposal: AgentActionProposal; context: AISidebarContentContext | null; onChange: (proposal: AgentActionProposal) => void }) {
  const [phase, setPhase] = useState<"idle" | "requesting" | "saving">("idle");
  const command = async (name: "confirm" | "cancel" | "retry") => {
    const requestId = crypto.randomUUID();
    setPhase("requesting");
    try {
      const isClient = (name === "confirm" || name === "retry") && proposal.clientEffect?.kind === "note_draft_patch";
      const response = await fetch(`/api/agent/actions/${proposal.id}/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId: requestId, ...(isClient ? { executionMode: "client" } : {}) }) });
      const data = await response.json().catch(() => null) as { action?: AgentActionProposal; error?: { message?: string } } | null;
      if (!response.ok || !data?.action) throw new Error(data?.error?.message ?? "操作失败");
      onChange(data.action);

      if (isClient && proposal.clientEffect && context?.kind === "note" && context.applyDraftPatch) {
        setPhase("saving");
        try {
          const result = await context.applyDraftPatch(proposal.clientEffect);
          const completed = await reportClientResult(proposal.id, requestId, { status: "succeeded", result });
          onChange(completed ?? { ...data.action, status: "succeeded" });
        } catch (error) {
          const message = error instanceof Error ? error.message : "笔记保存失败";
          const failed = await reportClientResult(proposal.id, requestId, { status: "failed", error: { code: "draft_save_failed", message } });
          onChange(failed ?? { ...data.action, status: "failed", error: { code: "draft_save_failed", message, retryable: true } });
        }
      }
    } catch (error) {
      const response = await fetch(`/api/agent/actions/${encodeURIComponent(proposal.id)}`, { cache: "no-store" }).catch(() => null);
      const payload = await response?.json().catch(() => null) as { action?: AgentActionProposal } | null;
      onChange(payload?.action ?? { ...proposal, error: { code: "action_request_failed", message: error instanceof Error ? error.message : "操作失败", retryable: true } });
    } finally { setPhase("idle"); }
  };

  const stateLabel = phase === "saving" ? "正在保存" : phase === "requesting" ? "正在确认" : actionStatusLabel(proposal.status);
  return <section className={`mewmo-ai-proposal mewmo-ai-proposal--${proposal.riskLevel}`}>
    <div className="mewmo-ai-proposal__head"><strong>{proposalTitle(proposal)}</strong><span>{stateLabel}</span></div>
    {proposal.preview.summary && <p>{proposal.preview.summary}</p>}
    {proposal.preview.diff && <pre>{proposal.preview.diff}</pre>}
    {proposal.error && <p className="mewmo-ai-proposal__error">{proposal.error.message}</p>}
    <div className="mewmo-ai-proposal__actions">
      {proposal.status === "proposed" && <><button type="button" disabled={phase !== "idle"} onClick={() => void command("cancel")}>取消</button><button type="button" className="mewmo-ai-proposal__confirm" disabled={phase !== "idle"} onClick={() => void command("confirm")}>确认执行</button></>}
      {proposal.status === "failed" && proposal.error?.retryable && <button type="button" disabled={phase !== "idle"} onClick={() => void command("retry")}><PrototypeIcon name="sync" size={12} />重试</button>}
    </div>
  </section>;
}

async function reportClientResult(actionId: string, clientRequestId: string, result: { status: "succeeded"; result: Record<string, unknown> } | { status: "failed"; error: { code: string; message: string } }): Promise<AgentActionProposal | undefined> {
  const response = await fetch(`/api/agent/actions/${actionId}/result`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId, ...result }) });
  if (!response.ok) throw new Error("无法同步操作结果");
  const data = await response.json().catch(() => null) as { action?: AgentActionProposal } | null;
  return data?.action;
}

function Message({ from, children }: { from: "assistant" | "user"; children: ReactNode }) { return <div className={`mewmo-ai-message mewmo-ai-message--${from}`}>{children}</div>; }
function normalizeMessages(messages: AgentChatMessage[]) { return messages.filter((message) => message.role === "user" || message.role === "assistant"); }
function proposalsFromMessages(messages: AgentChatMessage[]) {
  const map = new Map<string, AgentActionProposal>();
  for (const message of messages) {
    for (const proposal of message.metadata?.proposals ?? []) map.set(proposal.id, proposal);
  }
  return [...map.values()];
}
function mergeProposals(current: AgentActionProposal[], incoming: AgentActionProposal[]) { const map = new Map(current.map((item) => [item.id, item])); for (const item of incoming) map.set(item.id, item); return [...map.values()]; }
function normalizeSummaryText(summary: string | null) { return summary?.trim().replace(/(?:\s*(?:\.{3,}|…|⋯))+$/u, "") ?? ""; }
function contextLabel(kind: AISidebarContentContext["kind"]) { if (kind === "clip") return "剪藏"; if (kind === "feed_entry") return "订阅文章"; return "笔记"; }
function actionStatusLabel(status: AgentActionProposal["status"]) { return ({ proposed: "待确认", confirmed: "已确认", executing: "执行中", succeeded: "已完成", failed: "失败", cancelled: "已取消" } as const)[status]; }
function proposalTitle(proposal: AgentActionProposal) {
  return proposal.preview.title ?? ({ note_create: "创建笔记", note_update: "更新笔记", note_move: "移动笔记", note_move_to_trash: "移入废纸篓", note_restore: "恢复笔记", knowledge_base_create: "创建知识库", knowledge_base_rename: "重命名知识库", knowledge_item_move: "移动知识库内容", knowledge_item_remove: "移除知识库关联" } as Record<string, string>)[proposal.toolName] ?? "AI 操作";
}
