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
  onSkillConsumed: () => void;
  onSend: (options: { content: string; skillId?: string }) => void;
}

/**
 * Bottom-pinned chat input: row one is the textarea, row two hosts the
 * upload (demo only) and send buttons inside the same box.
 */
export function ChatInput({ status, chatReady, context, requestedSkill, onSkillConsumed, onSend }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [skillId, setSkillId] = useState<string | undefined>();
  const [attachedFile, setAttachedFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!requestedSkill) return;
    setSkillId(requestedSkill);
    setInput((current) => current || "请对当前内容进行深度洞察，指出关键联系、盲点、反例和下一步思考方向。");
    onSkillConsumed();
  }, [onSkillConsumed, requestedSkill]);

  const send = () => {
    const content = input.trim();
    if (!content || !chatReady || status === "sending") return;
    onSend({ content, ...(skillId ? { skillId } : {}) });
    setInput("");
    setSkillId(undefined);
    setAttachedFile(null);
  };

  const disabled = !chatReady || status === "loading" || status === "sending";

  return (
    <div className="mewmo-chat-input">
      {skillId && (
        <div className="mewmo-ai-skill-chip">
          <PrototypeIcon name="spark" size={12} />深度洞察
          <button type="button" onClick={() => setSkillId(undefined)} aria-label="取消深度洞察">
            <PrototypeIcon name="close" size={12} />
          </button>
        </div>
      )}
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
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={context ? `让 Agent 处理当前${contextLabel(context.kind)}` : "让 Agent 搜索或处理工作区内容"}
          disabled={disabled}
          rows={2}
        />
        <div className="mewmo-chat-input__toolbar">
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
