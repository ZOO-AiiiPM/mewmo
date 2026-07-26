"use client";

import { useEffect, useRef } from "react";
import type { AgentActionProposal } from "../../lib/agent-contract";
import type { TranscriptRow } from "../../lib/agent/types";
import type { AISidebarContentContext } from "../shell/AISidebar";
import { AssistantRow } from "./AssistantRow";

interface TranscriptListProps {
  stableRows: TranscriptRow[];
  liveRow: TranscriptRow | null;
  context: AISidebarContentContext | null;
  onProposalChange: (proposal: AgentActionProposal) => void;
  onRetry: () => void;
  retryTurnId?: string;
}

/**
 * Renders the full transcript: stable rows + live streaming row.
 * Auto-scrolls to bottom on new content.
 */
export function TranscriptList({ stableRows, liveRow, context, onProposalChange, onRetry, retryTurnId }: TranscriptListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  const allRows = liveRow ? [...stableRows, liveRow] : stableRows;

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (shouldAutoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [allRows.length, liveRow?.assistant.length]);

  // Track whether user is near bottom for auto-scroll
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    shouldAutoScroll.current = nearBottom;
  };

  if (allRows.length === 0) {
    return (
      <div className="mewmo-transcript mewmo-transcript--empty" ref={containerRef}>
        <div className="mewmo-transcript__welcome">
          <p>我可以搜索、创建、修改、润色、移动和整理你的内容。</p>
          <p>写操作会先展示预览，由你确认后执行。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mewmo-transcript" ref={containerRef} onScroll={handleScroll}>
      {stableRows.map((row) => (
        <AssistantRow
          key={row.turnId}
          row={row}
          context={context}
          onProposalChange={onProposalChange}
          {...(row.status === "failed" && row.turnId === retryTurnId ? { onRetry } : {})}
        />
      ))}
      {liveRow && (
        <AssistantRow
          key={liveRow.turnId}
          row={liveRow}
          context={context}
          onProposalChange={onProposalChange}
        />
      )}
    </div>
  );
}
