"use client";

import { useMemo } from "react";

import type { AgentActionProposal } from "../../lib/agent-contract";
import { groupBlocks } from "../../lib/agent/transcript-grouping";
import type { AssistantBlock, TranscriptRow } from "../../lib/agent/types";
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
}

/**
 * Renders one complete turn as a single assistant row.
 * Internal blocks: text / tool / thinking / confirmation.
 * Consecutive terminal tool blocks are folded into a collapsible group.
 * Failed turns show error + retry in-place.
 */
export function AssistantRow({ row, context, onProposalChange, onRetry }: AssistantRowProps) {
  const isStreaming = row.status === "streaming";
  const isFailed = row.status === "failed";
  const hasContent = row.assistant.length > 0;
  const groups = useMemo(() => groupBlocks(row.assistant), [row.assistant]);
  const lastBlock = row.assistant[row.assistant.length - 1];
  const showWorking = isStreaming && hasContent && lastBlock?.kind !== "text";

  return (
    <div className={`mewmo-transcript-row ${isFailed ? "mewmo-transcript-row--failed" : ""}`}>
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
