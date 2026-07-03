"use client";

import type { ReactNode } from "react";

export function AISidebar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <aside className={`mewmo-ai-rail ${open ? "mewmo-ai-rail--open" : ""}`} aria-hidden={!open}>
      <div className="mewmo-ai-rail__head">
        <div className="mewmo-ai-rail__mark" aria-hidden="true">AI</div>
        <div>
          <div className="mewmo-ai-rail__name">mewmo AI</div>
          <div className="mewmo-ai-rail__state">Not connected in this dogfood slice</div>
        </div>
        <button type="button" className="mewmo-icon-button" onClick={() => onOpenChange(false)} aria-label="Close AI rail">
          ×
        </button>
      </div>

      <div className="mewmo-ai-rail__body">
        <div className="mewmo-ai-rail__context">
          <span>Current context</span>
          <strong>Active workspace item</strong>
        </div>
        <Message from="assistant">
          I can sit beside the current note, clip, or feed entry here. Streaming is not wired yet, so actions stay disabled.
          <div className="mewmo-ai-rail__actions">
            <button type="button" disabled>Summarize</button>
            <button type="button" disabled>Find links</button>
          </div>
        </Message>
        <Message from="user">What changed since my last review?</Message>
        <Message from="assistant">Once sync and AI are connected, this rail can answer from the current page context without replacing the reader.</Message>
      </div>

      <div className="mewmo-ai-rail__ask">
        <input type="text" disabled placeholder="AI is not connected yet" />
        <button type="button" disabled aria-label="Send message">→</button>
      </div>
    </aside>
  );
}

function Message({ from, children }: { from: "assistant" | "user"; children: ReactNode }) {
  return <div className={`mewmo-ai-message mewmo-ai-message--${from}`}>{children}</div>;
}
