"use client";

import { useEffect, useRef, useState } from "react";
import { PrototypeIcon } from "../shell/PrototypeIcon";
import type { AISidebarContentContext } from "../shell/AISidebar";
import type { SendStatus } from "../../lib/agent/conversation-store";

interface ChatInputProps {
  status: SendStatus;
  chatReady: boolean;
  context: AISidebarContentContext | null;
  requestedSkill: string | null;
  showInsight?: boolean;
  onSkillConsumed: () => void;
  onDeepInsight: () => void;
  onSend: (options: { content: string; skillId?: string; includeContext: boolean }) => void;
}

const MAX_TEXTAREA_HEIGHT = 168;

/**
 * Bottom-pinned chat input: the box stacks a dismissible context chip, an
 * auto-growing textarea, and a toolbar row (upload / deep insight / send).
 */
export function ChatInput({ status, chatReady, context, requestedSkill, showInsight = true, onSkillConsumed, onDeepInsight, onSend }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [skillId, setSkillId] = useState<string | undefined>();
  const [attachedFile, setAttachedFile] = useState<string | null>(null);
  const [contextDropped, setContextDropped] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setContextDropped(false);
  }, [context?.id]);

  useEffect(() => {
    if (!requestedSkill) return;
    setSkillId(requestedSkill);
    setContextDropped(false);
    setInput((current) => current || "请对当前内容进行深度洞察，指出关键联系、盲点、反例和下一步思考方向。");
    onSkillConsumed();
  }, [onSkillConsumed, requestedSkill]);

  // Auto-grow the textarea with the draft, capped so long messages scroll.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [input]);

  const attachedContext = context && !contextDropped ? context : null;

  const send = () => {
    const content = input.trim();
    if (!content || !chatReady || status === "sending") return;
    onSend({ content, ...(skillId ? { skillId } : {}), includeContext: attachedContext !== null });
    setInput("");
    setSkillId(undefined);
    setAttachedFile(null);
  };

  const disabled = !chatReady || status === "loading" || status === "sending";

  return (
    <div className="mewmo-chat-input">
      {attachedFile && (
        <div className="mewmo-chat-input__attachment">
          <PrototypeIcon name="paperclip" size={12} />
          <span>{attachedFile}</span>
          <em>演示：文件不会上传</em>
          <button type="button" onClick={() => setAttachedFile(null)} aria-label="移除附件">
            <PrototypeIcon name="close" size={12} />
          </button>
        </div>
      )}
      <form
        className="mewmo-chat-input__box"
        onSubmit={(event) => { event.preventDefault(); send(); }}
      >
        {attachedContext && (
          <div className="mewmo-chat-input__context">
            <PrototypeIcon name={contextIcon(attachedContext.kind)} size={13} />
            <span className="mewmo-chat-input__context-title" title={attachedContext.title}>{attachedContext.title}</span>
            <em>{attachedContext.kind === "note" ? "笔记 · 使用最新草稿" : contextLabel(attachedContext.kind)}</em>
            <button type="button" onClick={() => { setContextDropped(true); setSkillId(undefined); }} aria-label="本次发送不附带当前内容">
              <PrototypeIcon name="close" size={12} />
            </button>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={attachedContext ? `让 Agent 处理当前${contextLabel(attachedContext.kind)}` : "让 Agent 搜索或处理工作区内容"}
          disabled={disabled}
          rows={1}
        />
        <div className="mewmo-chat-input__toolbar">
          <div className="mewmo-chat-input__tools">
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setAttachedFile(file.name);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="mewmo-chat-input__upload"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              aria-label="上传文件"
            >
              <PrototypeIcon name="paperclip" size={16} />
            </button>
            {showInsight && (
              <button
                type="button"
                className={`mewmo-chat-input__insight ${skillId ? "mewmo-chat-input__insight--active" : ""}`}
                onClick={() => (skillId ? setSkillId(undefined) : onDeepInsight())}
                disabled={disabled || (!skillId && !attachedContext)}
                aria-pressed={Boolean(skillId)}
              >
                <PrototypeIcon name="spark" size={13} />深度洞察
              </button>
            )}
          </div>
          <button
            type="submit"
            className="mewmo-chat-input__send"
            disabled={!input.trim() || disabled}
            aria-label="发送"
          >
            <PrototypeIcon name="send" size={14} />
          </button>
        </div>
      </form>
    </div>
  );
}

function contextLabel(kind: AISidebarContentContext["kind"]) {
  if (kind === "clip") return "剪藏";
  if (kind === "feed_entry") return "订阅文章";
  return "笔记";
}

function contextIcon(kind: AISidebarContentContext["kind"]) {
  if (kind === "clip") return "bookmark";
  if (kind === "feed_entry") return "rss";
  return "note";
}
