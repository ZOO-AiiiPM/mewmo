"use client";

import { useState } from "react";
import type { AgentActionProposal } from "../../lib/agent-contract";
import type { AISidebarContentContext } from "../shell/AISidebar";
import { PrototypeIcon } from "../shell/PrototypeIcon";

interface ConfirmationCardProps {
  proposal: AgentActionProposal;
  context: AISidebarContentContext | null;
  onChange: (proposal: AgentActionProposal) => void;
}

/**
 * Renders a write-action confirmation card.
 * Shows clear object, impact, and confirm/cancel buttons.
 * Migrated from the original ProposalCard in AISidebar.tsx.
 */
export function ConfirmationCard({ proposal, context, onChange }: ConfirmationCardProps) {
  const [phase, setPhase] = useState<"idle" | "requesting" | "saving">("idle");

  const command = async (name: "confirm" | "cancel" | "retry") => {
    const requestId = crypto.randomUUID();
    setPhase("requesting");
    try {
      const isClient = (name === "confirm" || name === "retry") && proposal.clientEffect?.kind === "note_draft_patch";
      const response = await fetch(`/api/agent/actions/${proposal.id}/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientRequestId: requestId, ...(isClient ? { executionMode: "client" } : {}) }),
      });
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
    } finally {
      setPhase("idle");
    }
  };

  const stateLabel = phase === "saving" ? "正在保存" : phase === "requesting" ? "正在确认" : actionStatusLabel(proposal.status);

  return (
    <section className={`mewmo-ai-proposal mewmo-ai-proposal--${proposal.riskLevel}`}>
      <div className="mewmo-ai-proposal__head">
        <strong>{proposalTitle(proposal)}</strong>
        <span>{stateLabel}</span>
      </div>
      {proposal.preview.summary && <p>{proposal.preview.summary}</p>}
      {proposal.preview.diff && <pre>{proposal.preview.diff}</pre>}
      {proposal.error && <p className="mewmo-ai-proposal__error">{proposal.error.message}</p>}
      <div className="mewmo-ai-proposal__actions">
        {proposal.status === "proposed" && (
          <>
            <button type="button" disabled={phase !== "idle"} onClick={() => void command("cancel")}>取消</button>
            <button type="button" className="mewmo-ai-proposal__confirm" disabled={phase !== "idle"} onClick={() => void command("confirm")}>确认执行</button>
          </>
        )}
        {proposal.status === "failed" && proposal.error?.retryable && (
          <button type="button" disabled={phase !== "idle"} onClick={() => void command("retry")}>
            <PrototypeIcon name="sync" size={12} />重试
          </button>
        )}
      </div>
    </section>
  );
}

async function reportClientResult(
  actionId: string,
  clientRequestId: string,
  result: { status: "succeeded"; result: Record<string, unknown> } | { status: "failed"; error: { code: string; message: string } },
): Promise<AgentActionProposal | undefined> {
  const response = await fetch(`/api/agent/actions/${actionId}/result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientRequestId, ...result }),
  });
  if (!response.ok) throw new Error("无法同步操作结果");
  const data = await response.json().catch(() => null) as { action?: AgentActionProposal } | null;
  return data?.action;
}

function actionStatusLabel(status: AgentActionProposal["status"]) {
  return ({ proposed: "待确认", confirmed: "已确认", executing: "执行中", succeeded: "已完成", failed: "失败", cancelled: "已取消" } as const)[status];
}

function proposalTitle(proposal: AgentActionProposal) {
  return proposal.preview.title ?? ({
    note_create: "创建笔记",
    note_update: "更新笔记",
    note_move: "移动笔记",
    note_move_to_trash: "移入废纸篓",
    note_restore: "恢复笔记",
    knowledge_base_create: "创建知识库",
    knowledge_base_rename: "重命名知识库",
    knowledge_item_move: "移动知识库内容",
    knowledge_item_remove: "移除知识库关联",
  } as Record<string, string>)[proposal.toolName] ?? "AI 操作";
}
