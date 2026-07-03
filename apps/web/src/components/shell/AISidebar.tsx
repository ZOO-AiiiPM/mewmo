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
          <div className="mewmo-ai-rail__name">喵喵 AI</div>
          <div className="mewmo-ai-rail__state">2.0 dogfood 暂未接入对话</div>
        </div>
        <button type="button" className="mewmo-icon-button" onClick={() => onOpenChange(false)} aria-label="Close AI rail">
          ×
        </button>
      </div>

      <div className="mewmo-ai-rail__body">
        <div className="mewmo-ai-rail__context">
          <span>当前上下文</span>
          <strong>正在阅读的内容</strong>
        </div>
        <Message from="assistant">
          我会在这里陪着当前笔记、剪藏或订阅文章。对话流还没有接入，所以动作先保持禁用。
          <div className="mewmo-ai-rail__actions">
            <button type="button" disabled>总结</button>
            <button type="button" disabled>找关联</button>
          </div>
        </Message>
        <Message from="user">我上次看完以后有什么变化？</Message>
        <Message from="assistant">同步和 AI 接上后，我会直接基于当前页面回答，不抢走阅读区。</Message>
      </div>

      <div className="mewmo-ai-rail__ask">
        <input type="text" disabled placeholder="AI 暂未接入" />
        <button type="button" disabled aria-label="发送">→</button>
      </div>
    </aside>
  );
}

function Message({ from, children }: { from: "assistant" | "user"; children: ReactNode }) {
  return <div className={`mewmo-ai-message mewmo-ai-message--${from}`}>{children}</div>;
}
