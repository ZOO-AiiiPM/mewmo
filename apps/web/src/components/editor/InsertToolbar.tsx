"use client";

import { useInstance } from "@milkdown/react";
import { editorViewCtx } from "@milkdown/kit/core";
import { insertBlock, toggleHighlight, type InsertKind } from "./insert-commands";

interface ToolbarItem {
  kind: InsertKind;
  label: string;
  icon: React.ReactNode;
}

const ITEMS: ToolbarItem[] = [
  {
    kind: "task",
    label: "待办",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="m8 12 3 3 5-6" />
      </svg>
    ),
  },
  {
    kind: "quote",
    label: "引用",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 5h12" />
        <path d="M10 5v6a4 4 0 0 1-4 4" />
        <path d="M6 19h12" />
      </svg>
    ),
  },
  {
    kind: "table",
    label: "表格",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
    ),
  },
  {
    kind: "code",
    label: "代码",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m8 18-6-6 6-6M16 6l6 6-6 6" />
      </svg>
    ),
  },
];

export function InsertToolbar() {
  const [loading, getEditor] = useInstance();

  const handleInsert = (kind: InsertKind) => {
    if (loading) return;
    const editor = getEditor();
    insertBlock(editor, kind);
    // 回焦编辑器：点击按钮会让编辑器失焦，插入后重新聚焦以便继续输入。
    editor?.action((ctx) => ctx.get(editorViewCtx).focus());
  };

  const handleHighlight = () => {
    if (loading) return;
    const editor = getEditor();
    toggleHighlight(editor);
    editor?.action((ctx) => ctx.get(editorViewCtx).focus());
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-full border border-line bg-paper/70 px-2 py-1.5 shadow-lg backdrop-blur-md">
      {ITEMS.map((item) => (
        <button
          key={item.kind}
          type="button"
          title={item.label}
          aria-label={item.label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => handleInsert(item.kind)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-moss-2 hover:text-moss"
        >
          {item.icon}
        </button>
      ))}
      <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
      <button
        type="button"
        title="高亮"
        aria-label="高亮"
        onMouseDown={(e) => e.preventDefault()}
        onClick={handleHighlight}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-moss-2 hover:text-moss"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 11-6 6v3h3l6-6" />
          <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
        </svg>
      </button>
    </div>
  );
}
