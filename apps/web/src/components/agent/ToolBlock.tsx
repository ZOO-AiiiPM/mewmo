"use client";

import { useEffect, useState } from "react";
import { PrototypeIcon } from "../shell/PrototypeIcon";

interface ToolBlockProps {
  display: string;
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
export function ToolBlock({ display, status }: ToolBlockProps) {
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
    <div className={`mewmo-tool-line mewmo-tool-line--${status}`}>
      <span className="mewmo-tool-line__icon" aria-hidden="true">
        {status === "running" && <PrototypeIcon name="sync" size={12} className="mewmo-tool-line__spin" />}
        {status === "done" && <PrototypeIcon name="check" size={12} />}
        {status === "error" && <PrototypeIcon name="close" size={12} />}
      </span>
      <span className={`mewmo-tool-line__label ${status === "running" ? "mewmo-tool-line__label--shimmer" : ""}`}>
        {display}
        {showTimer && <span className="mewmo-tool-line__elapsed"> · {elapsedSeconds}s</span>}
      </span>
    </div>
  );
}
