"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useConversationStore } from "../../lib/agent/conversation-store";
import type { ChatSummary } from "../../lib/agent/types";
import type { AISidebarContentContext } from "../shell/AISidebar";
import { ChatInput } from "./ChatInput";
import { ChatSwitcher } from "./ChatSwitcher";
import { TranscriptList } from "./TranscriptList";

interface AgentSidebarProps {
  context: AISidebarContentContext | null;
  requestedSkill: string | null;
  onSkillConsumed: () => void;
}

export function AgentSidebar({ context, requestedSkill, onSkillConsumed }: AgentSidebarProps) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);
  const [pendingChatId, setPendingChatId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const activeChatIdRef = useRef(activeChatId);
  activeChatIdRef.current = activeChatId;
  const store = useConversationStore(activeChatId);

  const createChat = useCallback(async (isDefault = false) => {
    const response = await fetch("/api/agent/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isDefault ? { default: true } : { title: "新会话" }),
    });
    const data = await response.json().catch(() => null) as { chat?: ChatSummary; error?: { message?: string } } | null;
    if (!response.ok || !data?.chat?.id) throw new Error(data?.error?.message ?? "无法创建会话");
    return data.chat;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/agent/chats", { cache: "no-store" });
        const data = await response.json().catch(() => null) as { chats?: ChatSummary[]; error?: { message?: string } } | null;
        if (!response.ok) throw new Error(data?.error?.message ?? "无法加载会话");
        let nextChats = data?.chats ?? [];
        if (nextChats.length === 0) nextChats = [await createChat(true)];
        if (cancelled) return;
        setChats(nextChats);
        setActiveChatId((current) => nextChats.some((chat) => chat.id === current) ? current : nextChats[0]?.id ?? null);
        setChatError(null);
      } catch (error) {
        if (!cancelled) setChatError(error instanceof Error ? error.message : "无法加载会话");
      } finally {
        if (!cancelled) setLoadingChats(false);
      }
    })();
    return () => { cancelled = true; };
  }, [createChat]);

  const handleNewChat = useCallback(async () => {
    setPendingChatId("new");
    try {
      const chat = await createChat();
      setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
      setActiveChatId(chat.id);
      setChatError(null);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "无法创建会话");
    } finally {
      setPendingChatId(null);
    }
  }, [createChat]);

  const handleRename = useCallback(async (chatId: string, title: string) => {
    setPendingChatId(chatId);
    try {
      const response = await fetch(`/api/agent/chats/${encodeURIComponent(chatId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
      const data = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(data?.error?.message ?? "无法重命名会话");
      setChats((current) => current.map((chat) => chat.id === chatId ? { ...chat, title } : chat));
      setChatError(null);
      return true;
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "无法重命名会话");
      return false;
    } finally {
      setPendingChatId(null);
    }
  }, []);

  const handleClear = useCallback(async (chatId: string) => {
    setPendingChatId(chatId);
    try {
      const response = await fetch(`/api/agent/chats/${encodeURIComponent(chatId)}/clear`, { method: "POST" });
      const data = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(data?.error?.message ?? "无法清空会话");
      if (chatId === activeChatIdRef.current) store.reload();
      setChatError(null);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "无法清空会话");
    } finally {
      setPendingChatId(null);
    }
  }, [activeChatId, store]);

  const handleDelete = useCallback(async (chatId: string) => {
    setPendingChatId(chatId);
    let replacement: ChatSummary | null = null;
    try {
      if (activeChatIdRef.current === chatId && chats.length === 1) replacement = await createChat();
      const response = await fetch(`/api/agent/chats/${encodeURIComponent(chatId)}`, { method: "DELETE" });
      const data = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(data?.error?.message ?? "无法删除会话");
      const remaining = chats.filter((chat) => chat.id !== chatId);
      const nextChats = replacement ? [replacement, ...remaining] : remaining;
      setChats(nextChats);
      if (activeChatIdRef.current === chatId) {
        setActiveChatId(nextChats[0]?.id ?? null);
      }
      setChatError(null);
    } catch (error) {
      if (replacement) {
        const replacementChat = replacement;
        setChats((current) => [replacementChat, ...current.filter((chat) => chat.id !== replacementChat.id)]);
      }
      setChatError(error instanceof Error ? error.message : "无法删除会话");
    } finally {
      setPendingChatId(null);
    }
  }, [activeChatId, chats, createChat]);

  const handleSend = useCallback((options: { content: string; skillId?: string }) => {
    store.send({
      content: options.content,
      ...(options.skillId ? { skillId: options.skillId } : {}),
      context: context ? { resource: { type: context.kind, id: context.id, title: context.title }, ...(context.kind === "note" ? { draft: context.draft } : {}) } : null,
    });
  }, [context, store]);

  const chatReady = activeChatId !== null && !loadingChats && store.status !== "loading";

  return (
    <div className="mewmo-agent-panel">
      <ChatSwitcher chats={chats} activeChatId={activeChatId} loading={loadingChats} pendingChatId={pendingChatId} onSelectChat={setActiveChatId} onNewChat={() => void handleNewChat()} onRename={handleRename} onClear={handleClear} onDelete={handleDelete} />
      {chatError && <div className="mewmo-agent-panel__error" role="alert">{chatError}<button type="button" onClick={() => setChatError(null)} aria-label="关闭提示">×</button></div>}
      <TranscriptList stableRows={store.stableRows} liveRow={store.liveRow} context={context} onProposalChange={store.updateProposal} onRetry={store.retry} {...(store.failedRequest ? { retryTurnId: store.failedRequest.turnId } : {})} />
      <ChatInput status={store.status} chatReady={chatReady} context={context} requestedSkill={requestedSkill} onSkillConsumed={onSkillConsumed} onSend={handleSend} />
    </div>
  );
}
