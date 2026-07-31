"use client";

import { useEffect, useRef } from "react";
import type { AgentActionProposal } from "../../lib/agent-contract";
import { canRegenerateRow } from "../../lib/agent/row-actions";
import type { TranscriptRow } from "../../lib/agent/types";
import type { AISidebarContentContext } from "../shell/AISidebar";
import { PrototypeIcon } from "../shell/PrototypeIcon";
import { AssistantRow } from "./AssistantRow";

interface TranscriptListProps {
  stableRows: TranscriptRow[];
  liveRow: TranscriptRow | null;
  loading: boolean;
  context: AISidebarContentContext | null;
  onProposalChange: (proposal: AgentActionProposal) => void;
  onRetry: () => void;
  /** Regenerate a row: truncate the chat from that turn and re-run its prompt. */
  onResend: (row: TranscriptRow) => void;
  /** Refill the composer with a user message for edit-and-resend (replaces the turn). */
  onEditUser: (content: string, turnId: string) => void;
  retryTurnId?: string;
}

/**
 * Renders the full transcript: stable rows + live streaming row.
 * Shows a lightweight skeleton (shared .mewmo-skeleton-block sweep) while the
 * persisted transcript loads. Auto-scrolls to bottom on new content. The outer
 * shell applies a CSS mask so content fades out at the top/bottom edges while
 * scrolling.
 */
export function TranscriptList({ stableRows, liveRow, loading, context, onProposalChange, onRetry, onResend, onEditUser, retryTurnId }: TranscriptListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  const allRows = liveRow ? [...stableRows, liveRow] : stableRows;

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (shouldAutoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [allRows.length, liveRow]);

  // Track whether user is near bottom for auto-scroll
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    shouldAutoScroll.current = nearBottom;
  };

  if (loading && allRows.length === 0) {
    return (
      <div className="mewmo-transcript-shell">
        <div className="mewmo-transcript mewmo-transcript--loading" ref={containerRef} aria-busy="true">
          <div className="mewmo-transcript-skeleton" aria-hidden="true">
            <span className="mewmo-skeleton-block mewmo-transcript-skeleton__bubble" />
            <span className="mewmo-skeleton-block mewmo-transcript-skeleton__line" />
            <span className="mewmo-skeleton-block mewmo-transcript-skeleton__line mewmo-transcript-skeleton__line--short" />
            <span className="mewmo-skeleton-block mewmo-transcript-skeleton__bubble" />
            <span className="mewmo-skeleton-block mewmo-transcript-skeleton__line" />
            <span className="mewmo-skeleton-block mewmo-transcript-skeleton__line mewmo-transcript-skeleton__line--short" />
          </div>
        </div>
      </div>
    );
  }

  if (allRows.length === 0) {
    return (
      <div className="mewmo-transcript-shell">
        <div className="mewmo-transcript mewmo-transcript--empty" ref={containerRef}>
          <div className="mewmo-transcript__welcome">
            <div className="mewmo-transcript__welcome-mark">
              <PrototypeIcon name="cat" size={20} />
            </div>
            <p className="mewmo-transcript__welcome-title">想整理点什么？</p>
            <p className="mewmo-transcript__welcome-note">
              <span>搜索、创建、润色、移动、归类，都交给 mew。</span>
              <span>写操作先出预览，你确认才执行。</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mewmo-transcript-shell">
      <div className="mewmo-transcript" ref={containerRef} onScroll={handleScroll}>
        {stableRows.map((row) => (
          <AssistantRow
            key={row.turnId}
            row={row}
            context={context}
            onProposalChange={onProposalChange}
            onEditUser={(content) => onEditUser(content, row.turnId)}
            {...(row.status === "failed" && row.turnId === retryTurnId ? { onRetry } : {})}
            {...(canRegenerateRow(row, liveRow !== null)
              ? { onRegenerate: () => onResend(row) }
              : {})}
          />
        ))}
        {liveRow && (
          <AssistantRow
            key={liveRow.turnId}
            row={liveRow}
            context={context}
            onProposalChange={onProposalChange}
            onEditUser={(content) => onEditUser(content, liveRow.turnId)}
          />
        )}
      </div>
    </div>
  );
}
