import { useCallback, useEffect, useRef, useState } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage, insertNewlineContinueMarkup } from '@codemirror/lang-markdown';
import { EditorView, keymap } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import { EditorSelection, Prec } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import { indentWithTab } from '@codemirror/commands';
import { livePreview, tableNavigationKeymap, insertTable, toggleTask } from '../lib/livePreview';
import { imagePasteDrop } from '../lib/imagePaste';
import { linkClickHandler } from '../lib/linkClick';
import { smoothScrollToTop } from '../lib/scrollToTop';
import { TableOfContents } from './TableOfContents';
import { ConfirmDialog } from './ConfirmDialog';
import type { Note } from '../types';

type Props = {
  note: Note | null;
  onChange: (patch: { title?: string; content_md?: string }, targetNoteId?: string) => void;
  theme: 'light' | 'dark';
  onDelete: () => void;
  onCreate: () => void;
  onImport: () => void;
  aiOpen: boolean;
  expanded: boolean;
  onExpand: () => void;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  // 父层标记的"刚通过新建按钮创建的笔记 id"——只有切到这条才触发 fade 动画
  newlyCreatedId: string | null;
  // fade 完成后通知父层清掉标记，避免再切回这条还触发动画
  onCreateAnimDone: () => void;
};

// 用某个标记包裹选区（Cmd+B / Cmd+I 用）
// changeByRange 返回的 range 必须是 SelectionRange，不能是 plain object——之前
// 用 `{ ...range, anchor, head }` 在某些 case 会被 CM 误解析或映射错位置
function wrapSelection(marker: string) {
  return (view: EditorView) => {
    const { state, dispatch } = view;
    const changes = state.changeByRange((range) => {
      if (range.empty) {
        return {
          changes: { from: range.from, insert: marker + marker },
          range: EditorSelection.cursor(range.from + marker.length),
        };
      }
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        range: EditorSelection.range(
          range.anchor + marker.length,
          range.head + marker.length,
        ),
      };
    });
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
    return true;
  };
}

// 检测光标处是否是空 wrap pair（**|** / *|* / ~~|~~ / `|`），是则一次性删除整段
// 解决 Cmd+B/I 等插入成对标记后立即按 backspace 想"撤销"时的体感问题
function deletePairBackward(view: EditorView): boolean {
  const { state, dispatch } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const pos = sel.head;
  // 长 marker 优先（** 比 * 先匹配，否则 **|** 会先撞 *|*）
  const pairs = ['~~', '**', '*', '`'];
  for (const marker of pairs) {
    const len = marker.length;
    if (pos < len) continue;
    const before = state.doc.sliceString(pos - len, pos);
    const after = state.doc.sliceString(pos, pos + len);
    if (before === marker && after === marker) {
      dispatch(state.update({
        changes: { from: pos - len, to: pos + len, insert: '' },
        selection: EditorSelection.cursor(pos - len),
        userEvent: 'delete.backward',
      }));
      return true;
    }
  }
  return false;
}

// Prec.high 提升优先级，确保 Backspace 抢在 CM 默认 deleteCharBackward 之前；
// Cmd+B/I 等格式快捷键也一并提升避免被其他 extension 拦截
const formatKeymap = Prec.high(keymap.of([
  { key: 'Mod-b', run: wrapSelection('**') },
  { key: 'Mod-i', run: wrapSelection('*') },
  { key: 'Mod-Shift-x', run: wrapSelection('~~') },
  { key: 'Mod-e', run: wrapSelection('`') },
  { key: 'Backspace', run: deletePairBackward },
  indentWithTab,
]));

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

export function NoteEditor({ note, onChange, theme, onDelete, onCreate, onImport, aiOpen, expanded, onExpand, canBack, canForward, onBack, onForward, newlyCreatedId, onCreateAnimDone }: Props) {
  const noteId = note?.id;
  // content 用 debounce 避免连续打字每键都写 DB；title 短、改完会停 → 直接 onChange 即时保存
  const contentDebounceRef = useRef<number | null>(null);
  const titleDebounceRef = useRef<number | null>(null);
  const titlePendingRef = useRef<string | null>(null);
  const lastNoteIdRef = useRef<string | null>(null);
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [cursorLine, setCursorLine] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 切笔记淡入淡出：1=显示中，0=过渡中（不重建 CM、不 unmount，只调 opacity）
  const [contentVisible, setContentVisible] = useState(true);
  // 滚动后 title 滚出视野 → toolbar 中央 fade-in 显示标题（同 ClipReader）
  const [titleInToolbar, setTitleInToolbar] = useState(false);

  const handleCmUpdate = (vu: ViewUpdate) => {
    if (vu.selectionSet || vu.docChanged) {
      const head = vu.state.selection.main.head;
      setCursorLine(vu.state.doc.lineAt(head).number);
    }
  };

  // 立即把 content 待写值写入（切笔记前用；targetId 显式传旧 id 修 race）
  const flushContent = useCallback((targetId?: string) => {
    if (contentDebounceRef.current) {
      window.clearTimeout(contentDebounceRef.current);
      contentDebounceRef.current = null;
    }
    const id = targetId ?? lastNoteIdRef.current;
    const view = cmRef.current?.view;
    if (id != null && view) {
      onChange({ content_md: view.state.doc.toString() }, id);
    }
  }, [onChange]);

  // 立即把 title 待写值写入。title 改可能触发后端 rename slug（Obsidian 风格），
  // 用 debounce 避免每按一字符就 rename + setNotes 改 id + key={note.id} 触发 input 重建打断 IME。
  const flushTitle = useCallback((targetId?: string) => {
    if (titleDebounceRef.current) {
      window.clearTimeout(titleDebounceRef.current);
      titleDebounceRef.current = null;
    }
    const value = titlePendingRef.current;
    titlePendingRef.current = null;
    const id = targetId ?? lastNoteIdRef.current;
    if (value !== null && id != null) {
      // flush body pending 到同一 id 再走 title rename：rename 后旧 slug 失效，body pending 必须先落
      flushContent(id);
      onChange({ title: value }, id);
    }
  }, [onChange, flushContent]);

  useEffect(() => {
    if (!note || note.id === lastNoteIdRef.current) return;

    // 切笔记前 flush 旧 note 的 title / content pending 到旧 id（修 race：
    // 默认 onChange 走 activeTab.refId，但已被改成新 id → 必须显式传 prevId）
    const prevId = lastNoteIdRef.current;
    if (prevId !== null) {
      if (titleDebounceRef.current) flushTitle(prevId);
      if (contentDebounceRef.current) flushContent(prevId);
    }

    // 替换 CM 内容 + 处理 focus 的实际工作
    const applyNote = () => {
      const view = cmRef.current?.view;
      if (!view) return;
      const content = note.content_md ?? '';
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        // 切笔记永远从顶部展示：cursor 放 0；显式 scrollDOM.scrollTop = 0 兜底置顶。
        // 副作用：首行若是 markdown widget（表格 / H1），livePreview 看 cursor 在该行
        // → 显示原文不渲染。用户点别处一次 widget 就回来。「打开就置顶」优先于「首行立即渲染 widget」。
        selection: { anchor: 0 },
      });
      view.scrollDOM.scrollTop = 0;
      // 仅在没有其它输入控件已聚焦时（例如用户正在打 title）才抢，避免打断用户
      if (document.activeElement === document.body || document.activeElement === null) {
        // 新建笔记 → 全选 title input，用户直接打字覆盖默认 slug 命名（macOS Finder 风格）
        const isNewlyCreated = newlyCreatedId === note.id;
        if (isNewlyCreated && titleInputRef.current) {
          titleInputRef.current.focus();
          titleInputRef.current.select();
        } else {
          view.focus();
        }
      }
      lastNoteIdRef.current = note.id;
    };

    // 第一次 mount（lastNoteIdRef 还是 null）→ 直接应用，不淡入避免 app 启动闪烁
    if (lastNoteIdRef.current === null) {
      applyNote();
      return;
    }

    // 严格判断"是不是刚新建的笔记"——只有这种才 fade，普通切换瞬时换内容
    const isFromCreate = note.id === newlyCreatedId;
    if (!isFromCreate) {
      applyNote();
      return;
    }

    // 新建笔记：fade-out → 换内容 → fade-in → 通知父层清标记
    setContentVisible(false);
    const t = window.setTimeout(() => {
      applyNote();
      setContentVisible(true);
      onCreateAnimDone();
    }, 150);
    return () => window.clearTimeout(t);
  }, [note, newlyCreatedId, onCreateAnimDone, flushContent]);

  const handleContentChange = (value: string) => {
    // applyNote 用 view.dispatch 替换 doc 时也会触发这里的 onChange（CM update listener 不区分 user vs programmatic）。
    // 那次 value === note.content_md，直接 return 不启动 debounce，否则会留下 pending → 切笔记时被 flushContent
    // 当成"用户改动"写回 DB → updated_at 被无谓刷新（用户没编辑也变成"刚改过"）
    if (note && value === (note.content_md ?? '')) return;
    if (contentDebounceRef.current) window.clearTimeout(contentDebounceRef.current);
    contentDebounceRef.current = window.setTimeout(() => {
      if (lastNoteIdRef.current !== null && note && value !== note.content_md) {
        onChange({ content_md: value });
      }
    }, 1000);
  };

  // title onChange debounce 600ms 后才调后端 update_note —— Obsidian 风格 rename 让 setNotes
  // 改 id，input 上 key={note.id} 会触发重建。如果每按一字符就 rename，IME 中文输入会被
  // 多次打断（「需求」可能只输到「需」就重建 input 丢光标）。debounce 让连续输入合并到一次。
  // 代价：list / tab 标题显示有 ~600ms 延迟（input 自己受控显示即时）。
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    titlePendingRef.current = value;
    if (titleDebounceRef.current) window.clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = window.setTimeout(() => flushTitle(), 600);
  };

  // 滚动监听：title input 底部滚到 toolbar 下沿之上 → toolbar 显示标题
  useEffect(() => {
    if (noteId == null) return;
    const root = scrollRef.current;
    if (!root) return;
    // 切笔记时直接 reset 到顶部 + 隐藏 toolbar 标题（不依赖测量）。
    // 之前 effect 里立即同步调 onScroll() 会拿到前一个 note 的 stale title rect →
    // setTitleInToolbar(true) → paint 完后真 scroll 触发又切 false → 肉眼闪两下。
    // 订阅 EntryReader 用同样的"直接 reset"思路就不闪。
    root.scrollTop = 0;
    setTitleInToolbar(false);
    const onScroll = () => {
      const titleEl = titleInputRef.current;
      if (!titleEl) return;
      const rootTop = root.getBoundingClientRect().top;
      const titleBottomRel = titleEl.getBoundingClientRect().bottom - rootTop;
      setTitleInToolbar(titleBottomRel < 56);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [noteId]);

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
      <div className={`absolute top-0 left-0 right-0 z-[5] h-12 grid grid-cols-[1fr_auto] items-center gap-3 pl-10 bg-white/70 dark:bg-stone-900/70 backdrop-blur-md transition-[padding] duration-200 ease-out ${aiOpen ? 'pr-[320px]' : 'pr-3'}`}>
        {/* 滚动后显现的底部分隔线：左右收 12px 留呼吸；aiOpen 时右端跟 toolbar pr 同步内移 */}
        <div className={`absolute bottom-0 left-3 h-px transition-[right,background-color] duration-200 ease-out ${aiOpen ? 'right-[320px]' : 'right-3'} ${titleInToolbar ? 'bg-black/[0.1] dark:bg-white/[0.1]' : 'bg-transparent'}`} />
          {/* 标题列：滚动后 fade-in 显示当前笔记标题；mask 让超出 icons 那侧渐隐 */}
          <div className="min-w-0 overflow-hidden">
            <span
              className={`block whitespace-nowrap text-[14px] font-bold text-stone-800 dark:text-stone-100 transition-opacity duration-200 ${
                titleInToolbar ? 'opacity-100' : 'opacity-0'
              }`}
              style={{
                maskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent)',
                WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 32px), transparent)',
              }}
            >
              {note.title || '无标题'}
            </span>
          </div>
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
          <button
            onClick={() => smoothScrollToTop(scrollRef.current)}
            title="回到顶部"
            className="w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            {/* arrow-up-to-line icon (lucide) */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 3h14" />
              <path d="m18 13-6-6-6 6" />
              <path d="M12 7v14" />
            </svg>
          </button>
          <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-1.5" />
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
            onClick={onImport}
            title="导入 HTML 文件 / 目录到笔记"
            className="w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            {/* lucide file-up icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="M12 18v-6" />
              <path d="m9 15 3-3 3 3" />
            </svg>
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto sidebar-scroll pt-12">
        <div
          style={{
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 150ms ease-out, transform 150ms ease-out',
          }}
        >
          <div className={`pl-10 pt-4 pb-2 transition-[padding] duration-200 ease-out ${aiOpen ? 'pr-[320px]' : 'pr-10'}`}>
            <input
              ref={titleInputRef}
              key={note.id}
              defaultValue={note.title}
              onChange={handleTitleChange}
              onKeyDown={(e) => {
                // Enter / ArrowDown 时把焦点切到 body 编辑器，光标定到首行
                // title 是即时保存，无需 flush
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
              className="w-full text-[32px] font-bold tracking-tight leading-tight bg-transparent outline-none text-stone-900 dark:text-stone-50 placeholder:text-stone-300 dark:placeholder:text-stone-600"
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
                // markdown 列表回车续行：「- 」/「* 」/「1. 2. 3.」（自增）/「> 」/「- [ ]」
                // 全部支持，空行末回车自动退出列表。Prec.high 让 livePreview / 默认 Enter 之前命中
                Prec.high(keymap.of([{ key: 'Enter', run: insertNewlineContinueMarkup }])),
                indentUnit.of('  '),
                EditorView.lineWrapping,
                baseTheme,
                noSpellcheck,
                tableNavigationKeymap,
                formatKeymap,
                livePreview,
                imagePasteDrop,
                linkClickHandler,
              ]}
              className={`live-md-editor ${theme === 'dark' ? 'cm-dark' : 'cm-light'}`}
            />
          </div>
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
