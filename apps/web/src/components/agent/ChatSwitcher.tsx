"use client";

import { useEffect, useRef, useState } from "react";

import type { ChatSummary } from "../../lib/agent/types";
import { PrototypeIcon } from "../shell/PrototypeIcon";

interface ChatSwitcherProps {
  chats: ChatSummary[];
  activeChatId: string | null;
  loading: boolean;
  pendingChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onRename: (chatId: string, title: string) => Promise<boolean>;
  onClear: (chatId: string) => Promise<void>;
  onDelete: (chatId: string) => Promise<void>;
}

export function ChatSwitcher({
  chats,
  activeChatId,
  loading,
  pendingChatId,
  onSelectChat,
  onNewChat,
  onRename,
  onClear,
  onDelete,
}: ChatSwitcherProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuChatId, setMenuChatId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const renamingRef = useRef(false);

  useEffect(() => {
    if (!menuChatId) return;
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuChatId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuChatId]);

  const handleRename = async (chatId: string) => {
    if (renamingRef.current) return;
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

  const activeChat = chats.find((chat) => chat.id === activeChatId);

  return (
    <div className="mewmo-chat-switcher" ref={menuRef}>
      <div className="mewmo-chat-switcher__bar">
        <button type="button" className="mewmo-chat-switcher__current" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-label="切换会话" disabled={loading}>
          <PrototypeIcon name="chat" size={14} />
          <span className="mewmo-chat-switcher__title">{loading ? "正在加载" : activeChat?.title ?? "新会话"}</span>
          <PrototypeIcon name="caret" size={12} />
        </button>
        <button type="button" className="mewmo-chat-switcher__new" onClick={onNewChat} aria-label="新建会话" disabled={loading || pendingChatId !== null}>
          <PrototypeIcon name="plus" size={14} />
        </button>
      </div>

      {expanded && (
        <div className="mewmo-chat-switcher__list" role="listbox" aria-label="会话列表">
          {chats.map((chat) => {
            const pending = pendingChatId === chat.id;
            return (
              <div key={chat.id} className={`mewmo-chat-switcher__item ${chat.id === activeChatId ? "mewmo-chat-switcher__item--active" : ""}`} role="option" aria-selected={chat.id === activeChatId}>
                {renamingId === chat.id ? (
                  <input className="mewmo-chat-switcher__rename-input" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onBlur={() => void handleRename(chat.id)} onKeyDown={(event) => { if (event.key === "Enter") void handleRename(chat.id); if (event.key === "Escape") setRenamingId(null); }} autoFocus maxLength={80} disabled={pending} />
                ) : (
                  <button type="button" className="mewmo-chat-switcher__item-button" onClick={() => { onSelectChat(chat.id); setExpanded(false); }} disabled={pending}>
                    <span className="mewmo-chat-switcher__item-title">{chat.title}</span>
                  </button>
                )}
                <button type="button" className="mewmo-chat-switcher__item-menu" onClick={(event) => { event.stopPropagation(); setMenuChatId(menuChatId === chat.id ? null : chat.id); }} aria-label="会话操作" disabled={pending}>
                  <PrototypeIcon name={pending ? "sync" : "more-horizontal"} size={14} />
                </button>

                {menuChatId === chat.id && (
                  <div className="mewmo-chat-switcher__menu">
                    <button type="button" onClick={() => { setRenamingId(chat.id); setRenameValue(chat.title); setMenuChatId(null); }}>重命名</button>
                    <button type="button" onClick={() => { setMenuChatId(null); if (window.confirm("确定清空这个会话的全部消息吗？")) void onClear(chat.id); }}>清空消息</button>
                    <button type="button" className="mewmo-chat-switcher__menu-danger" onClick={() => { setMenuChatId(null); if (window.confirm("确定删除这个会话吗？此操作无法撤销。")) void onDelete(chat.id); }}>删除会话</button>
                  </div>
                )}
              </div>
            );
          })}
          {chats.length === 0 && <div className="mewmo-chat-switcher__empty">暂无会话</div>}
        </div>
      )}
    </div>
  );
}
