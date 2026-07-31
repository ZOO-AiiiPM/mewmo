"use client";

import { useEffect, useMemo, useState } from "react";

import type { AgentActionProposal } from "../../lib/agent-contract";
import { assistantRowCopyText } from "../../lib/agent/row-actions";
import { groupBlocks } from "../../lib/agent/transcript-grouping";
import type { AssistantBlock, TranscriptRow } from "../../lib/agent/types";
import { contextChipIcon, contextChipLabel } from "../../lib/agent/context-display";
import type { AISidebarContentContext } from "../shell/AISidebar";
import { PrototypeIcon } from "../shell/PrototypeIcon";
import { ConfirmationCard } from "./ConfirmationCard";
import { StreamingMarkdown } from "./StreamingMarkdown";
import { ToolBlock } from "./ToolBlock";
import { ToolGroup } from "./ToolGroup";

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
 * Consecutive terminal tool blocks are folded into a collapsible group.
 * Failed turns show error + retry in-place.
 * Hover action bars: copy/edit on the user message, copy/regenerate on the reply.
 */
export function AssistantRow({ row, context, onProposalChange, onRetry, onEditUser, onRegenerate }: AssistantRowProps) {
  const [copied, setCopied] = useState<"user" | "assistant" | null>(null);
  const isStreaming = row.status === "streaming";
  const isFailed = row.status === "failed";
  const hasContent = row.assistant.length > 0;
  const groups = useMemo(() => groupBlocks(row.assistant), [row.assistant]);
  const lastBlock = row.assistant[row.assistant.length - 1];
  // Streaming with a non-text tail (tool running / just finished): keep a live status line.
  const showWorking = isStreaming && hasContent && lastBlock?.kind !== "text";
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
      {/* #6: context chip — messages sent with page context show what was attached */}
      {row.userContent && row.contextChip && (
        <div className="mewmo-ai-context-chip">
          <PrototypeIcon name={contextChipIcon(row.contextChip.kind)} size={12} />
          <span className="mewmo-ai-context-chip__title" title={row.contextChip.title}>
            {row.contextChip.title}
          </span>
          <em>{contextChipLabel(row.contextChip.kind)}</em>
        </div>
      )}

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

          {groups.map((group) =>
            group.kind === "tools" ? (
              <ToolGroup
                key={`${row.turnId}-tools-${group.startIndex}`}
                blocks={group.blocks}
                hasRunning={group.hasRunning}
              />
            ) : (
              <BlockRenderer
                key={`${row.turnId}-${group.index}`}
                block={group.block}
                streaming={isStreaming && group.index === row.assistant.length - 1}
                context={context}
                onProposalChange={onProposalChange}
              />
            ),
          )}

          {/* Streaming but the tail is not text yet: show a working status line */}
          {showWorking && (
            <div className="mewmo-working-line" aria-live="polite">
              <span className="mewmo-tool-line__label mewmo-tool-line__label--shimmer">正在工作…</span>
            </div>
          )}

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
