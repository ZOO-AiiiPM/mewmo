"use client";

import { useEffect, useState } from "react";

import type { AgentActionProposal } from "../../lib/agent-contract";
import { assistantRowCopyText } from "../../lib/agent/row-actions";
import type { AssistantBlock, TranscriptRow } from "../../lib/agent/types";
import type { AISidebarContentContext } from "../shell/AISidebar";
import { PrototypeIcon } from "../shell/PrototypeIcon";
import { ConfirmationCard } from "./ConfirmationCard";
import { StreamingMarkdown } from "./StreamingMarkdown";
import { ToolBlock } from "./ToolBlock";

interface AssistantRowProps {
  row: TranscriptRow;
  context: AISidebarContentContext | null;
  onProposalChange: (proposal: AgentActionProposal) => void;
  onRetry?: () => void;
  /** Refill the composer with this user message for edit-and-resend. */
  onEditUser?: (content: string) => void;
  /** Re-send the row's prompt as a new turn (last completed row only). */
  onRegenerate?: () => void;
}

/**
 * Renders one complete turn as a single assistant row.
 * Internal blocks: text / tool / thinking / confirmation.
 * Tool blocks are collapsed by default with product-friendly labels.
 * Failed turns show error + retry in-place.
 * Hover action bars: copy/edit on the user message, copy/regenerate on the reply.
 */
export function AssistantRow({ row, context, onProposalChange, onRetry, onEditUser, onRegenerate }: AssistantRowProps) {
  const [copied, setCopied] = useState<"user" | "assistant" | null>(null);
  const isStreaming = row.status === "streaming";
  const isFailed = row.status === "failed";
  const hasContent = row.assistant.length > 0;
  const lastBlock = row.assistant[row.assistant.length - 1];
  // Keep the thinking dots visible while the model works after a tool call.
  const waitingAfterTool = isStreaming && hasContent && lastBlock?.kind === "tool";
  const assistantText = assistantRowCopyText(row);
  const showAssistantActions = !isStreaming && (assistantText.length > 0 || Boolean(onRegenerate));

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyToClipboard = (target: "user" | "assistant", text: string) => {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(text).then(() => setCopied(target)).catch(() => undefined);
  };

  return (
    <div className={`mewmo-transcript-row ${isFailed ? "mewmo-transcript-row--failed" : ""}`}>
      {/* User message */}
      {row.userContent && (
        <div className="mewmo-message-group mewmo-message-group--user">
          <div className="mewmo-ai-message mewmo-ai-message--user">{row.userContent}</div>
          <div className="mewmo-message-actions mewmo-message-actions--user">
            <button
              type="button"
              className="mewmo-message-actions__button"
              onClick={() => copyToClipboard("user", row.userContent)}
              aria-label="复制消息"
              title="复制"
            >
              <PrototypeIcon name={copied === "user" ? "check" : "copy-plain"} size={13} />
            </button>
            {onEditUser && (
              <button
                type="button"
                className="mewmo-message-actions__button"
                onClick={() => onEditUser(row.userContent)}
                aria-label="编辑后重新发送"
                title="编辑重发"
              >
                <PrototypeIcon name="pen-new-square" size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Assistant blocks */}
      <div className="mewmo-message-group mewmo-message-group--assistant">
        <div className="mewmo-ai-message mewmo-ai-message--assistant">
          {!hasContent && isStreaming && <ThinkingDots />}

          {row.assistant.map((block, index) => (
            <BlockRenderer
              key={`${row.turnId}-${index}`}
              block={block}
              streaming={isStreaming && index === row.assistant.length - 1}
              context={context}
              onProposalChange={onProposalChange}
            />
          ))}

          {waitingAfterTool && <ThinkingDots />}

          {row.stopped && <div className="mewmo-transcript-stopped">已停止生成</div>}

          {/* Error state */}
          {isFailed && row.error && (
            <div className="mewmo-transcript-error">
              <span>{row.error.message}</span>
              {row.error.retryable && onRetry && (
                <button type="button" className="mewmo-ai-retry" onClick={onRetry}>
                  <PrototypeIcon name="sync" size={13} />重新尝试
                </button>
              )}
            </div>
          )}
        </div>

        {showAssistantActions && (
          <div className={`mewmo-message-actions ${onRegenerate ? "mewmo-message-actions--visible" : ""}`}>
            {assistantText.length > 0 && (
              <button
                type="button"
                className="mewmo-message-actions__button"
                onClick={() => copyToClipboard("assistant", assistantText)}
                aria-label="复制回复"
                title="复制"
              >
                <PrototypeIcon name={copied === "assistant" ? "check" : "copy-plain"} size={13} />
              </button>
            )}
            {onRegenerate && (
              <button
                type="button"
                className="mewmo-message-actions__button"
                onClick={onRegenerate}
                aria-label="重新生成回复"
                title="重新生成"
              >
                <PrototypeIcon name="sync" size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="mewmo-assistant-thinking">
      <span className="mewmo-assistant-thinking__dot" />
      <span className="mewmo-assistant-thinking__dot" />
      <span className="mewmo-assistant-thinking__dot" />
    </div>
  );
}

function BlockRenderer({
  block,
  streaming,
  context,
  onProposalChange,
}: {
  block: AssistantBlock;
  streaming: boolean;
  context: AISidebarContentContext | null;
  onProposalChange: (proposal: AgentActionProposal) => void;
}) {
  switch (block.kind) {
    case "text":
      return <StreamingMarkdown content={block.content} streaming={streaming} />;

    case "tool":
      return <ToolBlock display={block.display} status={block.status} />;

    case "thinking":
      return (
        <details className="mewmo-thinking-block">
          <summary>思考过程</summary>
          <div className="mewmo-thinking-block__content">{block.content}</div>
        </details>
      );

    case "confirmation":
      return <ConfirmationCard proposal={block.proposal} context={context} onChange={onProposalChange} />;

    default:
      return null;
  }
}
