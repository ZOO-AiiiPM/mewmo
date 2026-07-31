"use client";

import { useState } from "react";

import type { ToolAssistantBlock } from "../../lib/agent/transcript-grouping";
import { PrototypeIcon } from "../shell/PrototypeIcon";
import { ToolBlock } from "./ToolBlock";

interface ToolGroupProps {
  blocks: ToolAssistantBlock[];
  hasRunning: boolean;
}

/**
 * A run of ≥2 consecutive tool blocks. While any step is still running the
 * group stays expanded (rows listed one by one); once every step reaches a
 * terminal state it collapses into a one-line "已完成 N 步操作" summary that
 * can be expanded on demand.
 */
export function ToolGroup({ blocks, hasRunning }: ToolGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const open = hasRunning || expanded;
  const hasError = blocks.some((block) => block.status === "error");

  return (
    <div className={`mewmo-tool-group ${open ? "mewmo-tool-group--open" : ""}`}>
      {!hasRunning && (
        <button
          type="button"
          className={`mewmo-tool-group__summary ${hasError ? "mewmo-tool-group__summary--error" : ""}`}
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          <span className="mewmo-tool-group__summary-icon" aria-hidden="true">
            <PrototypeIcon name={hasError ? "close" : "check"} size={12} />
          </span>
          <span>已完成 {blocks.length} 步操作</span>
          <PrototypeIcon
            name="caret"
            size={10}
            className={`mewmo-tool-group__caret ${expanded ? "mewmo-tool-group__caret--open" : ""}`}
          />
        </button>
      )}
      {open && (
        <div className="mewmo-tool-group__rows">
          {blocks.map((block) => (
            <ToolBlock key={block.toolCallId} display={block.display} status={block.status} />
          ))}
        </div>
      )}
    </div>
  );
}
