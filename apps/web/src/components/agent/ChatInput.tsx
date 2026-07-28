"use client";

import { useEffect, useState } from "react";
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
 * Chat input bar with send button, skill chip, and disabled states.
 */
export function ChatInput({ status, chatReady, context, requestedSkill, onSkillConsumed, onSend }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [skillId, setSkillId] = useState<string | undefined>();

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
      <form
        className="mewmo-ai-rail__ask"
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
        <button
          type="submit"
          disabled={!input.trim() || disabled}
          aria-label="发送"
        >
          <PrototypeIcon name="send" size={14} />
        </button>
      </form>
    </div>
  );
}

function contextLabel(kind: AISidebarContentContext["kind"]) {
  if (kind === "clip") return "剪藏";
  if (kind === "feed_entry") return "订阅文章";
  return "笔记";
}
