"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";

import type { AgentActionProposal } from "../../lib/agent-contract";
import { assistantRowCopyText } from "../../lib/agent/row-actions";
import { assistantPresentation, isProcessBlock, processInitiallyOpen, processOpenAfterTerminal, processSummary } from "../../lib/agent/assistant-presentation";
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
  /** Refill the composer with this user message for edit-and-resend. */
  onEditUser?: (content: string) => void;
  /** Re-send the row's prompt as a new turn (last completed row only). */
  onRegenerate?: () => void;
}

/**
 * Renders one complete turn as a single assistant row.
 * Internal blocks: text / tool / thinking / confirmation.
 * Process blocks keep provider order inside one collapsible timeline.
 * Failed turns show error + retry in-place.
 * Hover action bars: copy/edit on the user message, copy/regenerate on the reply.
 * Memoized so streaming updates to the live row don't re-render (and
 * re-parse the markdown of) every stable row in the transcript.
 */
export const AssistantRow = memo(function AssistantRow({ row, context, onProposalChange, onRetry, onEditUser, onRegenerate }: AssistantRowProps) {
  const [copied, setCopied] = useState<"user" | "assistant" | null>(null);
  const isStreaming = row.status === "streaming";
  const isFailed = row.status === "failed";
  const reconcileCompletedTurn = row.status === "completed" && !row.stopped;
  const presentation = useMemo(
    () => assistantPresentation(row.assistant, reconcileCompletedTurn),
    [reconcileCompletedTurn, row.assistant],
  );
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
          {row.userContent && reconcileCompletedTurn && presentation.processBlocks.length > 0 && (
            <ProcessRegion
              blocks={presentation.processBlocks}
              hasFinal={presentation.finalBlocks.some((block) => block.kind === "text")}
              row={row}
              streamingIndex={presentation.streamingProcessIndex}
              context={context}
              onProposalChange={onProposalChange}
            />
          )}

          {!reconcileCompletedTurn && (
            <OrderedRunningBlocks
              blocks={presentation.orderedBlocks}
              row={row}
              streamingIndex={presentation.streamingProcessIndex}
              context={context}
              onProposalChange={onProposalChange}
            />
          )}

          {reconcileCompletedTurn && presentation.finalBlocks.map((block, index) => (
            <BlockRenderer
              key={`${row.turnId}-final-${index}`}
              block={block}
              streaming={index === presentation.streamingFinalIndex}
              final
              context={context}
              onProposalChange={onProposalChange}
            />
          ))}

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
});

function OrderedRunningBlocks({
  blocks,
  row,
  streamingIndex,
  context,
  onProposalChange,
}: {
  blocks: AssistantBlock[];
  row: TranscriptRow;
  streamingIndex: number;
  context: AISidebarContentContext | null;
  onProposalChange: (proposal: AgentActionProposal) => void;
}) {
  const hasProcess = blocks.some(isProcessBlock);
  const [open, setOpen] = useState(processInitiallyOpen(row));

  return (
    <div className="mewmo-live-turn">
      {hasProcess && (
        <button
          type="button"
          className="mewmo-thinking-region__title"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <PrototypeIcon name="caret" size={10} className={`mewmo-thinking-region__caret ${open ? "mewmo-thinking-region__caret--open" : ""}`} />
          <span>{processSummary(row)}</span>
        </button>
      )}
      {blocks.map((block, index) => isProcessBlock(block) ? (
        open && (
          <div className="mewmo-live-turn__process" key={`live-process-${index}`}>
            <BlockRenderer block={block} streaming={index === streamingIndex} context={context} onProposalChange={onProposalChange} />
          </div>
        )
      ) : (
        <BlockRenderer key={`live-answer-${index}`} block={block} streaming={index === streamingIndex} final context={context} onProposalChange={onProposalChange} />
      ))}
    </div>
  );
}

function ProcessRegion({
  blocks,
  hasFinal,
  row,
  streamingIndex,
  context,
  onProposalChange,
}: {
  blocks: AssistantBlock[];
  hasFinal: boolean;
  row: TranscriptRow;
  streamingIndex: number;
  context: AISidebarContentContext | null;
  onProposalChange: (proposal: AgentActionProposal) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const streaming = row.status === "streaming";
  const [open, setOpen] = useState(processInitiallyOpen(row));
  const wasStreaming = useRef(streaming);

  useEffect(() => {
    if (wasStreaming.current && !streaming) setOpen(processOpenAfterTerminal(row));
    wasStreaming.current = streaming;
  }, [row.status, row.stopped, streaming]);

  useEffect(() => {
    if (!streaming || !contentRef.current) return;
    contentRef.current.scrollTop = contentRef.current.scrollHeight;
  }, [blocks, streaming]);

  return (
    <details className={`mewmo-thinking-region ${hasFinal ? "mewmo-thinking-region--with-final" : ""}`} open={open}>
      <summary className="mewmo-thinking-region__title" onClick={(event) => { event.preventDefault(); setOpen((value) => !value); }}>
        <PrototypeIcon name="caret" size={10} className="mewmo-thinking-region__caret" />
        <span>{processSummary(row)}</span>
      </summary>
      <div
        ref={contentRef}
        className="mewmo-thinking-region__content"
        aria-live={streaming ? "polite" : "off"}
        tabIndex={0}
      >
        {blocks.map((block, index) => (
          <BlockRenderer
            key={`process-${index}`}
            block={block}
            streaming={index === streamingIndex}
            context={context}
            onProposalChange={onProposalChange}
          />
        ))}
      </div>
    </details>
  );
}

function BlockRenderer({
  block,
  streaming,
  context,
  onProposalChange,
  final = false,
}: {
  block: AssistantBlock;
  streaming: boolean;
  context: AISidebarContentContext | null;
  onProposalChange: (proposal: AgentActionProposal) => void;
  final?: boolean;
}) {
  switch (block.kind) {
    case "text":
      return (
        <div className={final ? "mewmo-final-answer" : "mewmo-process-narration"}>
          <StreamingMarkdown content={block.content} streaming={streaming} />
        </div>
      );

    case "tool":
      return <ToolBlock {...(block.toolName ? { toolName: block.toolName } : {})} display={block.display} {...(block.details ? { details: block.details } : {})} status={block.status} />;

    case "thinking":
      return (
        <div className="mewmo-process-thinking">
          <PrototypeIcon name="bulb" size={13} />
          <span className="mewmo-process-thinking__title">
            {streaming ? "深度思考中" : "思考过程"}
          </span>
          <div className="mewmo-process-thinking__content">{block.content}</div>
        </div>
      );

    case "confirmation":
      return <ConfirmationCard proposal={block.proposal} context={context} onChange={onProposalChange} />;

    default:
      return null;
  }
}
