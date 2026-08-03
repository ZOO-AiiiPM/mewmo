"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_CHAT_TITLE, deriveChatTitle } from "./chat-display";
import { useConversationStore, type ConversationStore } from "./conversation-store";
import type { ChatSummary } from "./types";

export interface AgentChats {
  chats: ChatSummary[];
  activeChatId: string | null;
  loadingChats: boolean;
  pendingChatId: string | null;
  chatError: string | null;
  store: ConversationStore;
  selectChat: (chatId: string) => void;
  newChat: () => Promise<void>;
  renameChat: (chatId: string, title: string) => Promise<boolean>;
  clearChat: (chatId: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  dismissError: () => void;
}

export interface AgentChatsOptions {
  /**
   * Start on a fresh conversation instead of resuming the latest one. An
   * untouched (zero-message) latest chat is reused so repeated visits don't
   * pile up empty sessions.
   */
  startFresh?: boolean;
}

/**
 * Owns the agent chat list plus the active conversation store, so both the
 * sidebar header (history / new chat) and the agent panel share one source.
 */
export function useAgentChats(options?: AgentChatsOptions): AgentChats {
  const startFresh = options?.startFresh ?? false;
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(false);
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
    setLoadingChats(true);
    const load = async () => {
      try {
        const response = await fetch("/api/agent/chats", { cache: "no-store" });
        const data = await response.json().catch(() => null) as { chats?: ChatSummary[]; error?: { message?: string } } | null;
        if (!response.ok) throw new Error(data?.error?.message ?? "无法加载会话");
        let nextChats = data?.chats ?? [];
        if (nextChats.length === 0) nextChats = [await createChat(true)];
        else if (startFresh && (nextChats[0]?.messageCount ?? 1) > 0) nextChats = [await createChat(), ...nextChats];
        if (cancelled) return;
        setChats(nextChats);
        setActiveChatId((current) => nextChats.some((chat) => chat.id === current) ? current : nextChats[0]?.id ?? null);
        setChatError(null);
      } catch (error) {
        if (!cancelled) setChatError(error instanceof Error ? error.message : "无法加载会话");
      } finally {
        if (!cancelled) setLoadingChats(false);
      }
    };
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [createChat, startFresh]);

  // Auto-naming (R4): when the active chat's transcript first goes from 0 to
  // >0 stable rows and its title is still the default "新会话", rename it to
  // the first user message truncated to 24 chars. Silent on failure — this
  // must never surface an error banner or lock the UI.
  const autoTitleRef = useRef<{ chatId: string | null; rowCount: number }>({ chatId: null, rowCount: 0 });
  const autoRenamedRef = useRef(new Set<string>());
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  useEffect(() => {
    const chatId = activeChatIdRef.current;
    const rows = store.stableRows;
    const previous = autoTitleRef.current;
    autoTitleRef.current = { chatId, rowCount: rows.length };
    if (!chatId || previous.chatId !== chatId) return;
    if (previous.rowCount !== 0 || rows.length === 0) return;
    if (autoRenamedRef.current.has(chatId)) return;
    const chat = chatsRef.current.find((item) => item.id === chatId);
    if (!chat || chat.title !== DEFAULT_CHAT_TITLE) return;
    const title = deriveChatTitle(rows[0]?.userContent ?? "");
    if (!title || title === chat.title) return;
    autoRenamedRef.current.add(chatId);
    void (async () => {
      try {
        const response = await fetch(`/api/agent/chats/${encodeURIComponent(chatId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!response.ok) return;
        setChats((current) => current.map((item) => (item.id === chatId ? { ...item, title } : item)));
      } catch {
        // Silent: auto-naming is best-effort only.
      }
    })();
  }, [store.stableRows]);

  const newChat = useCallback(async () => {
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

  const renameChat = useCallback(async (chatId: string, title: string) => {
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

  const clearChat = useCallback(async (chatId: string) => {
    if (store.status === "sending") {
      setChatError("请等待当前回复完成后再清空会话。");
      return;
    }
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
  }, [store]);

  const deleteChat = useCallback(async (chatId: string) => {
    if (store.status === "sending") {
      setChatError("请等待当前回复完成后再删除会话。");
      return;
    }
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
  }, [chats, createChat, store]);

  return {
    chats,
    activeChatId,
    loadingChats,
    pendingChatId,
    chatError,
    store,
    selectChat: setActiveChatId,
    newChat,
    renameChat,
    clearChat,
    deleteChat,
    dismissError: () => setChatError(null),
  };
}
