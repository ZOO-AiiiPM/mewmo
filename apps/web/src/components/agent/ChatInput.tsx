"use client";

import { useEffect, useRef, useState } from "react";
import { PrototypeIcon } from "../shell/PrototypeIcon";
import type { AISidebarContentContext } from "../shell/AISidebar";
import type { SendStatus } from "../../lib/agent/conversation-store";
import { shouldSendOnEnter } from "../../lib/agent/composer-send-key";
import { contextChipIcon, contextChipLabel } from "../../lib/agent/context-display";
import { shouldBlockStopFollowupSubmit } from "../../lib/agent/stop-pointer-guard";
import {
  buildComposerSendOptions,
  type ComposerSendOptions,
} from "../../lib/agent/composer-one-shot";

interface ChatInputProps {
  status: SendStatus;
  chatReady: boolean;
  context: AISidebarContentContext | null;
  requestedSkill: string | null;
  /** Edit-and-resend payload: refills the textarea (new object per request). */
  prefill: { text: string; turnId?: string } | null;
  showInsight?: boolean;
  onSkillConsumed: () => void;
  onPrefillConsumed: () => void;
  onDeepInsight: () => void;
  /** Stop the current streaming reply (shown in place of send while sending). */
  onStop: () => void;
  onSend: (options: ComposerSendOptions) => boolean | Promise<boolean>;
}

const MAX_TEXTAREA_HEIGHT = 168;
const STOP_POINTER_GUARD_MS = 500;

/**
 * Bottom-pinned chat input: the box stacks a dismissible context chip, an
 * auto-growing textarea, and a toolbar row (upload / deep insight / send).
 * While a reply is streaming the send button becomes a stop button.
 */
export function ChatInput({ status, chatReady, context, requestedSkill, prefill, showInsight = true, onSkillConsumed, onPrefillConsumed, onDeepInsight, onStop, onSend }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [skillId, setSkillId] = useState<string | undefined>();
  const [thinking, setThinking] = useState(false);
  const [attachedFile, setAttachedFile] = useState<string | null>(null);
  const [contextDropped, setContextDropped] = useState(false);
  // Editing an earlier message: sending will replace that turn instead of appending.
  const [editTurnId, setEditTurnId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // After stop swaps back to send, a late pointer click can land on the new
  // button. The form submit path stays unguarded so keyboard send still works.
  const sendGuardUntilRef = useRef(0);
  const sendPendingRef = useRef(false);

  useEffect(() => {
    setContextDropped(false);
  }, [context?.id]);

  useEffect(() => {
    if (!requestedSkill) return;
    setSkillId(requestedSkill);
    setContextDropped(false);
    // Without page context the skill runs against recent workspace content.
    setInput((current) => current || (context
      ? "请对当前内容进行深度洞察，指出关键联系、盲点、反例和下一步思考方向。"
      : "请对我工作区的最近内容进行深度洞察，指出关键联系、盲点、反例和下一步思考方向。"));
    onSkillConsumed();
  }, [context, onSkillConsumed, requestedSkill]);

  // Edit-and-resend: refill the textarea with an earlier user message.
  useEffect(() => {
    if (!prefill) return;
    setInput(prefill.text);
    setEditTurnId(prefill.turnId ?? null);
    onPrefillConsumed();
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el || el.disabled) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [onPrefillConsumed, prefill]);

  // Auto-grow the textarea with the draft, capped so long messages scroll.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [input]);

  const attachedContext = context && !contextDropped ? context : null;

  const send = async () => {
    const content = input.trim();
    if (!content || !chatReady || status === "sending" || sendPendingRef.current) return;
    sendPendingRef.current = true;

    try {
      const started = await onSend(buildComposerSendOptions({
        content,
        ...(skillId ? { skillId } : {}),
        thinking,
        includeContext: attachedContext !== null,
        ...(editTurnId ? { editTurnId } : {}),
      }));
      if (!started) return;
      setInput("");
      setSkillId(undefined);
      setAttachedFile(null);
      setEditTurnId(null);
    } catch {
      // The send did not start, so the draft and persistent options stay recoverable.
    } finally {
      sendPendingRef.current = false;
    }
  };

  // Keep the composer editable while streaming so stopping preserves the
  // user's next draft. send() still rejects submission until streaming ends.
  const disabled = !chatReady || status === "loading";

  return (
    <div className="mewmo-chat-input">
      {editTurnId && (
        <div className="mewmo-chat-input__editing">
          <PrototypeIcon name="pen-new-square" size={12} />
          <span>正在编辑之前的消息</span>
          <em>发送后将替换原轮次及之后的回复</em>
          <button type="button" onClick={() => { setEditTurnId(null); setInput(""); }} aria-label="取消编辑">
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
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {attachedContext && (
          <div className="mewmo-chat-input__context">
            <PrototypeIcon name={contextChipIcon(attachedContext.kind)} size={13} />
            <span className="mewmo-chat-input__context-title" title={attachedContext.title}>{attachedContext.title}</span>
            <em>{attachedContext.kind === "note" ? "笔记 · 使用最新草稿" : contextChipLabel(attachedContext.kind)}</em>
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
            // #2: while an IME composition is active (拼音候选未上屏), Enter
            // confirms the candidate — it must never send the message.
            if (event.key !== "Enter") return;
            if (!shouldSendOnEnter({
              key: event.key,
              shiftKey: event.shiftKey,
              isComposing: event.nativeEvent.isComposing,
              keyCode: event.keyCode,
            })) return;
            event.preventDefault();
            void send();
          }}
          placeholder={attachedContext ? `让 Agent 处理当前${contextChipLabel(attachedContext.kind)}` : "让 Agent 搜索或处理工作区内容"}
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
                disabled={disabled}
                aria-pressed={Boolean(skillId)}
              >
                <PrototypeIcon name="spark" size={13} />深度洞察
              </button>
            )}
            <button
              type="button"
              className={`mewmo-chat-input__thinking ${thinking ? "mewmo-chat-input__thinking--active" : ""}`}
              onClick={() => setThinking((current) => !current)}
              disabled={disabled}
              aria-pressed={thinking}
            >
              <PrototypeIcon name="bulb" size={13} />深度思考
            </button>
          </div>
          {status === "sending" ? (
            <button
              type="button"
              className="mewmo-chat-input__send mewmo-chat-input__send--stop"
              onClick={() => {
                sendGuardUntilRef.current = Date.now() + STOP_POINTER_GUARD_MS;
                onStop();
              }}
              aria-label="停止生成"
              title="停止生成"
            >
              <span className="mewmo-chat-input__stop-icon" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              className="mewmo-chat-input__send"
              disabled={!input.trim() || disabled}
              aria-label="发送"
              onClick={(event) => {
                if (shouldBlockStopFollowupSubmit(sendGuardUntilRef.current, Date.now(), event)) {
                  event.preventDefault();
                }
              }}
            >
              <PrototypeIcon name="send" size={14} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
