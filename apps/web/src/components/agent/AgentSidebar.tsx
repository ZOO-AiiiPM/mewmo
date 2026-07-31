"use client";

import { useCallback, useState } from "react";

import type { AgentChats } from "../../lib/agent/use-agent-chats";
import type { TranscriptRow } from "../../lib/agent/types";
import type { AISidebarContentContext } from "../shell/AISidebar";
import { ChatInput } from "./ChatInput";
import { TranscriptList } from "./TranscriptList";

interface AgentSidebarProps {
  agentChats: AgentChats;
  context: AISidebarContentContext | null;
  requestedSkill: string | null;
  showInsight?: boolean;
  onSkillConsumed: () => void;
  onDeepInsight: () => void;
}

export function AgentSidebar({ agentChats, context, requestedSkill, showInsight = true, onSkillConsumed, onDeepInsight }: AgentSidebarProps) {
  const { activeChatId, loadingChats, chatError, store, dismissError } = agentChats;
  // Edit-and-resend: a new object per request so repeated edits of the same text still refill.
  const [prefill, setPrefill] = useState<{ text: string; turnId?: string } | null>(null);

  const handleSend = useCallback((options: { content: string; skillId?: string; includeContext: boolean; editTurnId?: string }) => {
    const sendOptions = {
      content: options.content,
      ...(options.skillId ? { skillId: options.skillId } : {}),
      context: options.includeContext && context ? { resource: { type: context.kind, id: context.id, title: context.title }, ...(context.kind === "note" ? { draft: context.draft } : {}) } : null,
    };
    // Edited message: replace the original turn (and everything after it).
    if (options.editTurnId) store.sendReplacing(options.editTurnId, sendOptions);
    else store.send(sendOptions);
  }, [context, store]);

  // Regenerate: truncate the chat from this turn, then re-run the same prompt in place.
  const handleResend = useCallback((row: TranscriptRow) => {
    store.sendReplacing(row.turnId, { content: row.userContent, context: null });
  }, [store]);

  // Optimistic rows (`live-` / `failed-`) have no server turn to replace; edit them as a plain refill.
  const handleEditUser = useCallback((content: string, turnId: string) => {
    const replaceable = !turnId.startsWith("live-") && !turnId.startsWith("failed-");
    setPrefill({ text: content, ...(replaceable ? { turnId } : {}) });
  }, []);
  const handlePrefillConsumed = useCallback(() => setPrefill(null), []);

  const chatReady = activeChatId !== null && !loadingChats && store.status !== "loading";
  const panelLoading = loadingChats || store.status === "loading";

  return (
    <div className="mewmo-agent-panel">
      {chatError && <div className="mewmo-agent-panel__error" role="alert">{chatError}<button type="button" onClick={dismissError} aria-label="关闭提示">×</button></div>}
      <TranscriptList stableRows={store.stableRows} liveRow={store.liveRow} loading={panelLoading} context={context} onProposalChange={store.updateProposal} onRetry={store.retry} onResend={handleResend} onEditUser={handleEditUser} {...(store.failedRequest ? { retryTurnId: store.failedRequest.turnId } : {})} />
      <ChatInput status={store.status} chatReady={chatReady} context={context} requestedSkill={requestedSkill} prefill={prefill} showInsight={showInsight} onSkillConsumed={onSkillConsumed} onPrefillConsumed={handlePrefillConsumed} onDeepInsight={onDeepInsight} onStop={store.stop} onSend={handleSend} />
    </div>
  );
}
