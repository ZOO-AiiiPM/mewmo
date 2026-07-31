"use client";

import { useEffect, useRef, useState } from "react";

import { relativeTime, resolveChatTitle } from "../../lib/agent/chat-display";
import type { ChatSummary } from "../../lib/agent/types";
import { PrototypeIcon } from "../shell/PrototypeIcon";

interface ChatSwitcherProps {
  chats: ChatSummary[];
  activeChatId: string | null;
  loading: boolean;
  locked: boolean;
  pendingChatId: string | null;
  onOpen?: () => void;
  onSelectChat: (chatId: string) => void;
  onRename: (chatId: string, title: string) => Promise<boolean>;
  onClear: (chatId: string) => Promise<void>;
  onDelete: (chatId: string) => Promise<void>;
}

/**
 * Header history button: slides in a right-side drawer listing chat sessions
 * with select / rename / clear / delete actions. Rows show a relative update
 * time; empty never-used chats (except the active one) are hidden.
 */
export function ChatSwitcher({
  chats,
  activeChatId,
  loading,
  locked,
  pendingChatId,
  onOpen,
  onSelectChat,
  onRename,
  onClear,
  onDelete,
}: ChatSwitcherProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuChatId, setMenuChatId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const renamingRef = useRef(false);
  const busy = locked || pendingChatId !== null;

  // Hide empty sessions ("新会话" noise): never used and not currently active.
  const visibleChats = chats.filter(
    (chat) => chat.id === activeChatId || chat.messageCount !== 0,
  );

  useEffect(() => {
    if (!expanded) return;
    const handler = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setExpanded(false);
        setMenuChatId(null);
        setRenamingId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  useEffect(() => {
    if (!busy) return;
    setMenuChatId(null);
    setRenamingId(null);
  }, [busy]);

  const handleRename = async (chatId: string) => {
    if (busy || renamingRef.current) return;
    const title = renameValue.trim();
    if (!title) {
      setRenamingId(null);
      return;
    }
    renamingRef.current = true;
    try {
      if (await onRename(chatId, title)) setRenamingId(null);
    } finally {
      renamingRef.current = false;
    }
  };

  return (
    <div className="mewmo-chat-switcher" ref={rootRef}>
      <button
        type="button"
        className={`mewmo-icon-button ${expanded ? "mewmo-icon-button--active" : ""}`}
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          if (next) onOpen?.();
        }}
        aria-expanded={expanded}
        aria-label="历史会话"
        disabled={loading || busy}
      >
        <PrototypeIcon name="history" size={17} />
      </button>

      {expanded && (
        <>
          <div
            className="mewmo-chat-switcher__backdrop"
            onClick={() => { setExpanded(false); setMenuChatId(null); setRenamingId(null); }}
            aria-hidden="true"
          />
          <div className="mewmo-chat-switcher__drawer" role="dialog" aria-label="历史会话">
            <div className="mewmo-chat-switcher__drawer-head">
              <span>历史会话</span>
              <button type="button" className="mewmo-icon-button" onClick={() => setExpanded(false)} aria-label="收起会话列表">
                <PrototypeIcon name="close" size={16} />
              </button>
            </div>
            <div className="mewmo-chat-switcher__list" role="listbox" aria-label="会话列表">
              {visibleChats.map((chat) => {
                const pending = pendingChatId === chat.id;
                const menuOpen = menuChatId === chat.id;
                return (
                  <div key={chat.id} className={`mewmo-chat-switcher__item ${chat.id === activeChatId ? "mewmo-chat-switcher__item--active" : ""}`} role="option" aria-selected={chat.id === activeChatId}>
                    {renamingId === chat.id ? (
                      <input className="mewmo-chat-switcher__rename-input" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={() => void handleRename(chat.id)} onKeyDown={(event) => { if (event.key === "Enter") void handleRename(chat.id); if (event.key === "Escape") setRenamingId(null); }} autoFocus maxLength={80} disabled={busy} />
                    ) : (
                      <button type="button" className="mewmo-chat-switcher__item-button" onClick={() => { onSelectChat(chat.id); setExpanded(false); }} disabled={busy}>
                        <span className="mewmo-chat-switcher__item-title">{resolveChatTitle(chat.title, chat.preview)}</span>
                        <span className="mewmo-chat-switcher__item-time">{relativeTime(chat.updatedAt)}</span>
                      </button>
                    )}
                    <button type="button" className={`mewmo-chat-switcher__item-menu ${menuOpen || pending ? "mewmo-chat-switcher__item-menu--visible" : ""}`} onClick={(event) => { event.stopPropagation(); setMenuChatId(menuOpen ? null : chat.id); }} aria-label="会话操作" disabled={busy}>
                      <PrototypeIcon name={pending ? "sync" : "more-horizontal"} size={14} />
                    </button>

                    {menuOpen && (
                      <div className="mewmo-chat-switcher__menu">
                        <button type="button" disabled={busy} onClick={() => { setRenamingId(chat.id); setRenameValue(resolveChatTitle(chat.title, chat.preview)); setMenuChatId(null); }}>重命名</button>
                        <button type="button" disabled={busy} onClick={() => { setMenuChatId(null); if (window.confirm("确定清空这个会话的全部消息吗？")) void onClear(chat.id); }}>清空消息</button>
                        <button type="button" className="mewmo-chat-switcher__menu-danger" disabled={busy} onClick={() => { setMenuChatId(null); if (window.confirm("确定删除这个会话吗？此操作无法撤销。")) void onDelete(chat.id); }}>删除会话</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {visibleChats.length === 0 && <div className="mewmo-chat-switcher__empty">暂无会话</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
