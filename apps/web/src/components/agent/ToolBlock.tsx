"use client";

import { useEffect, useState } from "react";
import { PrototypeIcon } from "../shell/PrototypeIcon";

interface ToolBlockProps {
  toolName?: string;
  display: string;
  details?: string[];
  status: "running" | "done" | "error";
}

/** Seconds a tool must keep running before the inline timer appears. */
const TIMER_THRESHOLD_SECONDS = 3;

/**
 * Renders a tool execution step as a lightweight inline status line
 * (icon + label + optional elapsed timer). Running steps shimmer; once a
 * step has been running for more than 3s a per-second timer is appended.
 * Never shows JSON, function names, or provider metadata.
 */
export function ToolBlock({ toolName, display, details, status }: ToolBlockProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Purely frontend timing: starts when the component mounts in the running
  // state. Persisted transcripts replay with terminal statuses, so no timer.
  useEffect(() => {
    if (status !== "running") return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const showTimer = status === "running" && elapsedSeconds >= TIMER_THRESHOLD_SECONDS;

  return (
    <div className="mewmo-tool-step">
      <div className={`mewmo-tool-line mewmo-tool-line--${status}`}>
        <span className="mewmo-tool-line__icon" aria-hidden="true">
          <PrototypeIcon name={toolIconName(toolName)} size={13} />
        </span>
        <span className={`mewmo-tool-line__label ${status === "running" ? "mewmo-tool-line__label--shimmer" : ""}`}>
          {display}
          {showTimer && <span className="mewmo-tool-line__elapsed"> · {elapsedSeconds}s</span>}
        </span>
      </div>
      {details && details.length > 0 && (
        <ul className="mewmo-tool-details" aria-label="工具详情">
          {details.map((detail, index) => <li key={`${index}-${detail}`}>{detail}</li>)}
        </ul>
      )}
    </div>
  );
}

export function toolIconName(toolName?: string) {
  if (toolName === "web_search" || toolName === "web_fetch") return "magnifer-linear" as const;
  if (toolName === "content_search" || toolName === "content_read" || toolName === "read_current_context") return "library" as const;
  return "sledgehammer-linear" as const;
}
