"use client";

import { useState } from "react";

export function AISidebar() {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside className="w-10 h-screen sticky top-0 border-l border-line bg-paper flex flex-col items-center py-4">
        <button
          onClick={() => setCollapsed(false)}
          className="w-7 h-7 rounded-md bg-moss-2 text-moss text-xs font-bold flex items-center justify-center hover:bg-moss hover:text-white transition-colors"
          title="Expand AI panel"
        >
          A
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-[308px] h-screen sticky top-0 flex flex-col border-l border-line bg-paper/80 backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <span className="text-xs font-semibold uppercase tracking-wider text-moss">
          AI Context
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-xs text-muted hover:text-ink transition-colors"
        >
          Hide
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <ContextCard label="Active Note" value="Getting Started with mewmo" />
        <ContextCard label="Selected Tags" value="productivity, knowledge" />
        <ContextCard label="Unread Feeds" value="12 new articles" />
      </div>

      <div className="p-3 border-t border-line">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ask mewmo AI..."
            className="flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted outline-none focus:border-moss"
          />
          <button className="px-3 py-2 rounded-md bg-moss text-white text-sm font-medium hover:bg-moss/90 transition-colors">
            →
          </button>
        </div>
      </div>
    </aside>
  );
}

function ContextCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper-2 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted mb-1">
        {label}
      </div>
      <div className="text-sm text-ink">{value}</div>
    </div>
  );
}
