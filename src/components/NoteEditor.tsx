import { useEffect, useRef, useState } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorView, keymap } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import { indentUnit } from '@codemirror/language';
import { indentWithTab } from '@codemirror/commands';
import { livePreview, insertTable, toggleTask } from '../lib/livePreview';
import { imagePasteDrop } from '../lib/imagePaste';
import { linkClickHandler } from '../lib/linkClick';
import { TableOfContents } from './TableOfContents';
import { ConfirmDialog } from './ConfirmDialog';
import type { Note } from '../types';

type Props = {
  note: Note | null;
  onChange: (patch: { title?: string; content_md?: string }) => void;
  theme: 'light' | 'dark';
  onDelete: () => void;
  onCreate: () => void;
  aiOpen: boolean;
  expanded: boolean;
  onExpand: () => void;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
};

// 用某个标记包裹选区（Cmd+B / Cmd+I 用）
function wrapSelection(marker: string) {
  return (view: EditorView) => {
    const { state, dispatch } = view;
    const changes = state.changeByRange((range) => {
      if (range.empty) {
        return {
          changes: { from: range.from, insert: marker + marker },
          range: { ...range, anchor: range.from + marker.length, head: range.from + marker.length },
        };
      }
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        range: {
          ...range,
          anchor: range.anchor + marker.length,
          head: range.head + marker.length,
        },
      };
    });
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
    return true;
  };
}

const formatKeymap = keymap.of([
  { key: 'Mod-b', run: wrapSelection('**') },
  { key: 'Mod-i', run: wrapSelection('*') },
  { key: 'Mod-Shift-x', run: wrapSelection('~~') },
  { key: 'Mod-e', run: wrapSelection('`') },
  indentWithTab,
]);

const baseTheme = EditorView.theme({
  '&': {
    fontSize: '15px',
    backgroundColor: 'transparent',
  },
  '&.cm-focused': {
    outline: 'none !important',
  },
  '.cm-content': {
    fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, 'SF Pro Display', sans-serif",
    padding: '0 40px 40px 0',
    caretColor: 'currentColor',
    lineHeight: '1.7',
    textDecoration: 'none',
  },
  '.cm-line': {
    padding: '0',
  },
  '.cm-scroller': {
    overflow: 'visible',
    fontFamily: 'inherit',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'currentColor',
  },
  '.cm-selectionBackground, ::selection': {
    background: 'rgba(59, 130, 246, 0.18) !important',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    background: 'transparent !important',
  },
  '.cm-gutters': {
    display: 'none',
  },
});

// 关掉拼写检查的下划线 + 强制 contentEditable 不带浏览器默认装饰
const noSpellcheck = EditorView.contentAttributes.of({
  spellcheck: 'false',
  autocorrect: 'off',
  autocapitalize: 'off',
});

export function NoteEditor({ note, onChange, theme, onDelete, onCreate, aiOpen, expanded, onExpand, canBack, canForward, onBack, onForward }: Props) {
  const debounceRef = useRef<number | null>(null);
  const lastNoteIdRef = useRef<number | null>(null);
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleCmUpdate = (vu: ViewUpdate) => {
    if (vu.selectionSet || vu.docChanged) {
      const head = vu.state.selection.main.head;
      setCursorLine(vu.state.doc.lineAt(head).number);
    }
  };

  useEffect(() => {
    if (!note || note.id === lastNoteIdRef.current) return;
    const view = cmRef.current?.view;
    if (view) {
      const content = note.content_md ?? '';
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: content,
        },
        // 光标放到文档末尾，避免落在首行（首行常是表格 / 标题）让 livePreview 误判"用户在编辑首块"而不渲染 widget
        selection: { anchor: content.length },
        scrollIntoView: true,
      });
      // 给 body 编辑器一个初始焦点，否则 cursor 不会闪烁，看起来像"没光标"
      // 但仅在没有其它输入控件已聚焦时（例如用户正在打 title）才抢，避免打断用户
      if (document.activeElement === document.body || document.activeElement === null) {
        view.focus();
      }
      lastNoteIdRef.current = note.id;
    }
  }, [note]);

  const handleContentChange = (value: string) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      if (lastNoteIdRef.current !== null && note && value !== note.content_md) {
        onChange({ content_md: value });
      }
    }, 1000);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      onChange({ title: newTitle });
    }, 1000);
  };

  if (!note) {
    return (
      <main className="flex-1 flex flex-col">
        <div className="h-12 shrink-0" />
        <div className="flex-1 flex items-center justify-center text-stone-400 dark:text-stone-500 text-sm">
          从左侧选一条笔记，或新建一条 ✨
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex-1 flex flex-col overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 z-[5] h-12 flex items-center justify-between pl-3 bg-white/70 dark:bg-stone-900/70 backdrop-blur-md transition-[padding] duration-200 ease-out ${aiOpen ? 'pr-[320px]' : 'pr-3'}`}>
          <div className="flex items-center gap-0.5">
          <button
            onClick={onBack}
            disabled={!canBack}
            title="返回上一条笔记"
            className="w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 disabled:hover:bg-transparent disabled:text-stone-300 disabled:dark:text-stone-600 disabled:cursor-not-allowed transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
          </button>
          <button
            onClick={onForward}
            disabled={!canForward}
            title="前进到下一条笔记"
            className="w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 disabled:hover:bg-transparent disabled:text-stone-300 disabled:dark:text-stone-600 disabled:cursor-not-allowed transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
          <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-1.5" />
          <button
            onClick={() => {
              const view = cmRef.current?.view;
              if (view) insertTable(view);
            }}
            title="插入表格"
            className="w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M3 9h18" />
              <path d="M3 15h18" />
              <path d="M9 3v18" />
              <path d="M15 3v18" />
            </svg>
          </button>
          <button
            onClick={() => {
              const view = cmRef.current?.view;
              if (view) toggleTask(view);
            }}
            title="切换待办 / 勾选"
            className="w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </button>
          </div>
          <div className="flex items-center gap-0.5">
          <button
            onClick={onExpand}
            title={expanded ? '收起 (⌘⇧F)' : '专注模式 (⌘⇧F)'}
            className="w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            {expanded ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="10 5 10 10 5 10" />
                <line x1="10" y1="10" x2="3" y2="3" />
                <polyline points="14 19 14 14 19 14" />
                <line x1="14" y1="14" x2="21" y2="21" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="8 3 3 3 3 8" />
                <line x1="3" y1="3" x2="10" y2="10" />
                <polyline points="16 21 21 21 21 16" />
                <line x1="14" y1="14" x2="21" y2="21" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            title="删除笔记"
            className="w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" x2="10" y1="11" y2="17" />
              <line x1="14" x2="14" y1="11" y2="17" />
            </svg>
          </button>
          <button
            onClick={onCreate}
            title="新建笔记"
            className="w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          </div>
        </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto pt-12">
        <div className={`pl-10 pt-4 pb-2 transition-[padding] duration-200 ease-out ${aiOpen ? 'pr-[320px]' : 'pr-10'}`}>
          <input
            key={note.id}
            defaultValue={note.title}
            onChange={handleTitleChange}
            onKeyDown={(e) => {
              // Enter / ArrowDown 时把焦点切到 body 编辑器，光标定到首行
              if (e.key === 'Enter' || e.key === 'ArrowDown') {
                e.preventDefault();
                const view = cmRef.current?.view;
                if (view) {
                  view.focus();
                  view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
                }
              }
            }}
            placeholder="无标题"
            className="w-full text-[26px] font-semibold tracking-tight bg-transparent outline-none text-stone-900 dark:text-stone-50 placeholder:text-stone-300 dark:placeholder:text-stone-600"
          />
        </div>
        <div
          className={`pl-10 cursor-text transition-[padding] duration-200 ease-out ${aiOpen ? 'pr-[280px]' : ''}`}
          onClick={(e) => {
            // 点击 wrapper 空白区域时 focus body 编辑器；点击 CodeMirror 内部已有内容时让 CM 自己处理
            if (e.target === e.currentTarget) {
              cmRef.current?.view?.focus();
            }
          }}
        >
          <CodeMirror
            ref={cmRef}
            value={note.content_md}
            onChange={handleContentChange}
            onUpdate={handleCmUpdate}
            theme="none"
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
              indentOnInput: true,
              bracketMatching: false,
              closeBrackets: false,
              autocompletion: false,
              history: true,
              drawSelection: true,
              dropCursor: true,
              allowMultipleSelections: false,
              crosshairCursor: false,
              highlightSelectionMatches: false,
              syntaxHighlighting: false,
            }}
            extensions={[
              markdown({ base: markdownLanguage, codeLanguages: [] }),
              indentUnit.of('  '),
              EditorView.lineWrapping,
              baseTheme,
              noSpellcheck,
              formatKeymap,
              livePreview,
              imagePasteDrop,
              linkClickHandler,
            ]}
            className={`live-md-editor ${theme === 'dark' ? 'cm-dark' : 'cm-light'}`}
          />
        </div>
      </div>
      <TableOfContents content={note.content_md} cursorLine={cursorLine} cmRef={cmRef} scrollRef={scrollRef} />
      <ConfirmDialog
        open={confirmOpen}
        title="删除笔记"
        description={`确定删除「${note.title || '无标题'}」吗？\n相关附件会被移到系统回收站，可从那里恢复。`}
        confirmLabel="删除"
        variant="danger"
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </main>
  );
}
