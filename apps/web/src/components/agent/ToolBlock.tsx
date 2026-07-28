"use client";

import { useState } from "react";
import { PrototypeIcon } from "../shell/PrototypeIcon";

interface ToolBlockProps {
  display: string;
  status: "running" | "done" | "error";
}

/**
 * Renders a tool execution step as a collapsible, product-friendly block.
 * Never shows JSON, function names, or provider metadata.
 */
export function ToolBlock({ display, status }: ToolBlockProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`mewmo-tool-block mewmo-tool-block--${status}`}>
      <button
        type="button"
        className="mewmo-tool-block__header"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="mewmo-tool-block__icon">
          {status === "running" && <PrototypeIcon name="sync" size={12} className="mewmo-tool-block__spin" />}
          {status === "done" && <PrototypeIcon name="check" size={12} />}
          {status === "error" && <PrototypeIcon name="close" size={12} />}
        </span>
        <span className="mewmo-tool-block__label">{display}</span>
        <PrototypeIcon name="caret" size={10} className={`mewmo-tool-block__chevron ${expanded ? "mewmo-tool-block__chevron--open" : ""}`} />
      </button>
      {expanded && (
        <div className="mewmo-tool-block__detail">
          {status === "running" && <span>正在处理中…</span>}
          {status === "done" && <span>已完成</span>}
          {status === "error" && <span>执行过程中遇到问题，Agent 已尝试继续。</span>}
        </div>
      )}
    </div>
  );
}
