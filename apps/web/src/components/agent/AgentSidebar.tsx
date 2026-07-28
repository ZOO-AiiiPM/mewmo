"use client";

import { useCallback } from "react";

import type { AgentChats } from "../../lib/agent/use-agent-chats";
import type { AISidebarContentContext } from "../shell/AISidebar";
import { ChatInput } from "./ChatInput";
import { TranscriptList } from "./TranscriptList";

interface AgentSidebarProps {
  agentChats: AgentChats;
  context: AISidebarContentContext | null;
  requestedSkill: string | null;
  onSkillConsumed: () => void;
  onDeepInsight: () => void;
}

export function AgentSidebar({ agentChats, context, requestedSkill, onSkillConsumed, onDeepInsight }: AgentSidebarProps) {
  const { activeChatId, loadingChats, chatError, store, dismissError } = agentChats;

  const handleSend = useCallback((options: { content: string; skillId?: string; includeContext: boolean }) => {
    store.send({
      content: options.content,
      ...(options.skillId ? { skillId: options.skillId } : {}),
      context: options.includeContext && context ? { resource: { type: context.kind, id: context.id, title: context.title }, ...(context.kind === "note" ? { draft: context.draft } : {}) } : null,
    });
  }, [context, store]);

  const chatReady = activeChatId !== null && !loadingChats && store.status !== "loading";

  return (
    <div className="mewmo-agent-panel">
      {chatError && <div className="mewmo-agent-panel__error" role="alert">{chatError}<button type="button" onClick={dismissError} aria-label="关闭提示">×</button></div>}
      <TranscriptList stableRows={store.stableRows} liveRow={store.liveRow} context={context} onProposalChange={store.updateProposal} onRetry={store.retry} {...(store.failedRequest ? { retryTurnId: store.failedRequest.turnId } : {})} />
      <ChatInput status={store.status} chatReady={chatReady} context={context} requestedSkill={requestedSkill} onSkillConsumed={onSkillConsumed} onDeepInsight={onDeepInsight} onSend={handleSend} />
    </div>
  );
}
