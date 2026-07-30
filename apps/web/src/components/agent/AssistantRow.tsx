"use client";

import type { AgentActionProposal } from "../../lib/agent-contract";
import type { AssistantBlock, TranscriptRow } from "../../lib/agent/types";
import { contextChipIcon, contextChipLabel } from "../../lib/agent/context-display";
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
}

/**
 * Renders one complete turn as a single assistant row.
 * Internal blocks: text / tool / thinking / confirmation.
 * Tool blocks are collapsed by default with product-friendly labels.
 * Failed turns show error + retry in-place.
 */
export function AssistantRow({ row, context, onProposalChange, onRetry }: AssistantRowProps) {
  const isStreaming = row.status === "streaming";
  const isFailed = row.status === "failed";
  const hasContent = row.assistant.length > 0;

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
        <div className="mewmo-ai-message mewmo-ai-message--user">{row.userContent}</div>
      )}

      {/* Assistant blocks */}
      <div className="mewmo-ai-message mewmo-ai-message--assistant">
        {!hasContent && isStreaming && (
          <div className="mewmo-assistant-thinking">
            <span className="mewmo-assistant-thinking__dot" />
            <span className="mewmo-assistant-thinking__dot" />
            <span className="mewmo-assistant-thinking__dot" />
          </div>
        )}

        {row.assistant.map((block, index) => (
          <BlockRenderer
            key={`${row.turnId}-${index}`}
            block={block}
            streaming={isStreaming && index === row.assistant.length - 1}
            context={context}
            onProposalChange={onProposalChange}
          />
        ))}

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
