"use client";

import { useCallback, useState } from "react";

import type { AgentChats } from "../../lib/agent/use-agent-chats";
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
  const [prefill, setPrefill] = useState<{ text: string } | null>(null);

  const handleSend = useCallback((options: { content: string; skillId?: string; includeContext: boolean }) => {
    store.send({
      content: options.content,
      ...(options.skillId ? { skillId: options.skillId } : {}),
      context: options.includeContext && context ? { resource: { type: context.kind, id: context.id, title: context.title }, ...(context.kind === "note" ? { draft: context.draft } : {}) } : null,
    });
  }, [context, store]);

  // Regenerate: the backend has no truncate endpoint, so re-send the prompt as a new turn.
  const handleResend = useCallback((content: string) => {
    store.send({ content, context: null });
  }, [store]);

  const handleEditUser = useCallback((content: string) => setPrefill({ text: content }), []);
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
