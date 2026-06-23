import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage, insertNewlineContinueMarkup } from '@codemirror/lang-markdown';
import { EditorView, keymap } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import { EditorSelection, Prec } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import { indentWithTab } from '@codemirror/commands';
import { livePreview, focusEffect, tableNavigationKeymap, insertTable, toggleTask, getImageDeleteBackwardRange, deleteTableBackward } from '../lib/livePreview';
import type { TaskToggleRange } from '../lib/livePreview';
import { toggleHeading, toggleLinePrefix, orderedListRenumber } from '../lib/markdownFormat';
import { imagePasteDrop } from '../lib/imagePaste';
import { linkClickHandler } from '../lib/linkClick';
import { getSessionScrollPosition, rememberSessionScrollPosition } from '../lib/sessionScrollMemory';
import { TableOfContents } from './TableOfContents';
import { ScrollToTopButton } from './ScrollToTopButton';
import { ConfirmDialog } from './ConfirmDialog';
import type { Note } from '../types';

type Props = {
  note: Note | null;
  onChange: (patch: { title?: string; content_md?: string }, targetNoteId?: string) => void;
  onLocalContentChange: (id: string, content_md: string) => void;
  theme: 'light' | 'dark';
  onDelete?: () => void;
  onCreate: () => void;
  onImport?: () => void;
  aiOpen: boolean;
  expanded: boolean;
  onExpand: () => void;
  canBack?: boolean;
  canForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
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

function insertLink(view: EditorView) {
  const { state, dispatch } = view;
  const changes = state.changeByRange((range) => {
    if (range.empty) {
      return {
        changes: { from: range.from, insert: '[](url)' },
        range: EditorSelection.cursor(range.from + 1),
      };
    }
    return {
      changes: [
        { from: range.from, insert: '[' },
        { from: range.to, insert: '](url)' },
      ],
      range: EditorSelection.range(range.to + 3, range.to + 6),
    };
  });
  dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
  return true;
}

// 光标退到图片右边界时，一次 Backspace 整段删除 ![alt|width](src)，而不是逐字符啃成残缺文本。
// 边界识别逻辑（同行紧贴 / 下一行行首）抽在 livePreview.ts，这里只做 dispatch。
function deleteImageBackward(view: EditorView): boolean {
  const { state, dispatch } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const range = getImageDeleteBackwardRange(state.doc, sel.head);
  if (!range) return false;
  dispatch(state.update({
    changes: { from: range.from, to: range.to, insert: '' },
    selection: EditorSelection.cursor(range.from),
    userEvent: 'delete.backward',
  }));
  return true;
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

// 空行 Enter 退出 markup（引用/列表）：只要当前行是空的 markup 行，Enter 就清掉标记变普通行
// CM6 内置 insertNewlineContinueMarkup 需要连续两个空行才退出，这里改为单次即退
function exitEmptyMarkup(view: EditorView): boolean {
  const state = view.state;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const text = line.text;
  // 匹配空引用行: > 或 >  （可能多层 > > ）
  // 匹配空列表行: - 、* 、+ 、1. 等后面没内容
  // 匹配空任务行: - [ ] 或 - [x] 后面没内容
  const emptyQuote = /^(\s*>)+\s*$/.test(text);
  const emptyList = /^\s*(?:[-*+]|\d+[.)]) \s*$/.test(text);
  const emptyTask = /^\s*[-*+] \[[ xX]\]\s*$/.test(text);
  if (!emptyQuote && !emptyList && !emptyTask) return false;
  // 清掉当前行内容，变成空行
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: '' },
    selection: EditorSelection.cursor(line.from),
  });
  return true;
}

// Prec.high 提升优先级，确保 Backspace 抢在 CM 默认 deleteCharBackward 之前；
// Cmd+B/I 等格式快捷键也一并提升避免被其他 extension 拦截
const formatKeymap = Prec.high(keymap.of([
  { key: 'Mod-b', run: wrapSelection('**') },
  { key: 'Mod-i', run: wrapSelection('*') },
  { key: 'Mod-Shift-x', run: wrapSelection('~~') },
  { key: 'Mod-e', run: wrapSelection('`') },
  { key: 'Mod-k', run: insertLink },
  { key: 'Mod-Alt-1', run: toggleHeading(1) },
  { key: 'Mod-Alt-2', run: toggleHeading(2) },
  { key: 'Mod-Alt-3', run: toggleHeading(3) },
  { key: 'Mod-Alt-4', run: toggleHeading(4) },
  { key: 'Mod-Alt-5', run: toggleHeading(5) },
  { key: 'Mod-Alt-6', run: toggleHeading(6) },
  { key: 'Mod-Shift-.', run: toggleLinePrefix('quote') },
  { key: 'Mod-Shift-8', run: toggleLinePrefix('bullet') },
  { key: 'Mod-Shift-7', run: toggleLinePrefix('ordered') },
  { key: 'Mod-Shift-9', run: (view) => { toggleTask(view); return true; } },
  { key: 'Mod-Alt-t', run: (view) => { insertTable(view); return true; } },
  { key: 'Backspace', run: deleteTableBackward },
  { key: 'Backspace', run: deleteImageBackward },
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
  '::selection': {
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

export function NoteEditor({ note, onChange, onLocalContentChange, theme, onDelete, onCreate, onImport, aiOpen, expanded, onExpand, canBack, canForward, onBack, onForward, newlyCreatedId, onCreateAnimDone }: Props) {
  const noteId = note?.id;
  // content 立即更新前端内存，落盘 debounce，避免每键写文件 + 重建搜索索引。
  const contentDebounceRef = useRef<number | null>(null);
  const contentPendingRef = useRef<{ id: string; value: string } | null>(null);
  const titleDebounceRef = useRef<number | null>(null);
  const titlePendingRef = useRef<string | null>(null);
  const titleFocusedRef = useRef(false);
  const lastNoteIdRef = useRef<string | null>(null);
  // title 改名（Obsidian 风格 slug rename）会让 note.id 变。若拿 note.id 当 title textarea /
  // CodeMirror 的 React key，rename 会重挂载这两个组件 → 打断 IME 输入、焦点掉到 <body>、
  // 光标跳回行首（用户报：空白笔记输第一个字，原英文 slug 蹦出来、光标在左）。
  // renameFromRef 记下「自己刚发起改名的旧 slug」，让渲染期 + 切笔记 effect 把
  // 「同一篇改名」和「真切换到别篇」区分开：改名时不重挂载、不重置光标。
  const renameFromRef = useRef<string | null>(null);
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const bodySelectionRef = useRef<TaskToggleRange | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const [, setCursorLine] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 切笔记淡入淡出：1=显示中，0=过渡中（不重建 CM、不 unmount，只调 opacity）
  const [contentVisible, setContentVisible] = useState(true);
  // 滚动后 title 滚出视野 → toolbar 中央 fade-in 显示标题（同 ClipReader）
  const [titleInToolbar, setTitleInToolbar] = useState(false);
  // 编辑器重挂载 key：只在「真·切换笔记」时自增；title 改名导致的 note.id 变化保持不变。
  // 用它替代 note.id 当 title textarea / CodeMirror 的 key（见 renameFromRef 注释）。
  const [mountKey, setMountKey] = useState(0);
  const [keyedNoteId, setKeyedNoteId] = useState<string | null>(note?.id ?? null);
  const [localContent, setLocalContent] = useState(note?.content_md ?? '');
  const localContentRef = useRef(note?.content_md ?? '');

  // 渲染期决定是否重挂载：note.id 变了且不是「当前笔记改名」才 bump mountKey。
  // key 必须在渲染期（而非 effect 里）定下来，重挂载才会和 applyNote 落在同一次 commit，
  // 否则 applyNote 会作用在旧 view 上、被随后的重挂载丢弃。setState-during-render 由
  // `note.id !== keyedNoteId` 守卫，幂等、StrictMode 安全。
  /* eslint-disable react-hooks/refs -- 渲染期读 ref 有意为之：必须同步判断是否 remount */
  if (note && note.id !== keyedNoteId) {
    const isRename = renameFromRef.current !== null && renameFromRef.current === keyedNoteId;
    setKeyedNoteId(note.id);
    if (!isRename) setMountKey((k) => k + 1);
    // renameFromRef 不在这里清——留给下方切笔记 effect 判断是否跳过 applyNote 的光标归零
  }
  /* eslint-enable react-hooks/refs */

  const resizeTitleInput = useCallback(() => {
    const el = titleInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleCmUpdate = (vu: ViewUpdate) => {
    if (vu.selectionSet || vu.docChanged) {
      const head = vu.state.selection.main.head;
      const line = vu.state.doc.lineAt(head).number;
      if (vu.view.hasFocus) {
        const sel = vu.state.selection.main;
        bodySelectionRef.current = { from: sel.from, to: sel.to };
      }
      setCursorLine(prev => (prev === line ? prev : line));
    }
  };

  // 立即把 content 待写值写入（切笔记前用；targetId 显式传旧 id 修 race）
  const flushContent = useCallback((targetId?: string) => {
    if (contentDebounceRef.current) {
      window.clearTimeout(contentDebounceRef.current);
      contentDebounceRef.current = null;
    }
    const pending = contentPendingRef.current;
    const id = targetId ?? pending?.id;
    if (pending != null && pending.id === id) {
      onChange({ content_md: pending.value }, pending.id);
      contentPendingRef.current = null;
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
      // 自发 flush（debounce 到点，targetId 未传）= 改的是当前笔记标题 → 可能触发 slug rename。
      // 标记旧 slug，让渲染期 / 切笔记 effect 把「同一篇 rename」与「真切换」区分开。
      // 切笔记前的 flush（targetId 已传）是「离开这篇」，不标记。
      if (targetId === undefined) {
        renameFromRef.current = id;
        const marked = id;
        // 兜底：rename 若没改 slug（同名）则上述两处都不消费它，定时清掉防 stale 误判后续切换
        window.setTimeout(() => {
          if (renameFromRef.current === marked) renameFromRef.current = null;
        }, 800);
      }
      onChange({ title: value }, id);
    }
  }, [onChange, flushContent]);

  useEffect(() => {
    if (!note) {
      const prevId = lastNoteIdRef.current;
      if (prevId !== null) {
        if (titleDebounceRef.current) flushTitle(prevId);
        if (contentDebounceRef.current) flushContent(prevId);
      }
      lastNoteIdRef.current = null;
      bodySelectionRef.current = null;
      localContentRef.current = '';
      setLocalContent('');
      return;
    }

    if (note.id === lastNoteIdRef.current) {
      const content = note.content_md ?? '';
      if (contentPendingRef.current?.id === note.id || content === localContentRef.current) return;
      localContentRef.current = content;
      setLocalContent(content);
      const view = cmRef.current?.view;
      if (view && view.state.doc.toString() !== content) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: content },
          effects: [focusEffect.of(false)],
        });
      }
      return;
    }

    // 切笔记前 flush 旧 note 的 title / content pending 到旧 id（修 race：
    // 默认 onChange 走 activeTab.refId，但已被改成新 id → 必须显式传 prevId）
    const prevId = lastNoteIdRef.current;
    if (prevId !== null) {
      if (titleDebounceRef.current) flushTitle(prevId);
      if (contentDebounceRef.current) flushContent(prevId);
    }

    // 当前笔记被自己改了 title → slug rename → note.id 从 prevId 变成新 slug：同一篇笔记，
    // 不是切换。重挂载已在渲染期通过 mountKey 跳过；这里再跳过 applyNote 的内容/光标/焦点重置，
    // 让用户继续在标题里输入而不被打断（焦点、IME、光标位置全部原样保留）。
    if (renameFromRef.current !== null && renameFromRef.current === prevId) {
      renameFromRef.current = null;
      lastNoteIdRef.current = note.id;
      return;
    }
    renameFromRef.current = null;

    // 替换 CM 内容 + 处理 focus 的实际工作
    const applyNote = () => {
      // 先认领当前 note id：切换检测、flushTitle 的 rename 都靠 lastNoteIdRef，
      // 不能因为 CM view 还没就绪（重挂载后 view 异步创建）就 early-return 漏设 → 否则
      // flushTitle 拿到 id=null 跳过 onChange，title 改名永远不触发。内容由 value prop 兜底同步。
      lastNoteIdRef.current = note.id;
      const content = note.content_md ?? '';
      localContentRef.current = content;
      setLocalContent(content);
      const view = cmRef.current?.view;
      if (!view) return;
      if (view.hasFocus) view.contentDOM.blur();
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        selection: { anchor: 0 },
        effects: [focusEffect.of(false)],
      });
      bodySelectionRef.current = { from: 0, to: 0 };
      view.scrollDOM.scrollTop = 0;
      // 切笔记重挂载（mountKey 变）后焦点会落到 <body>。用 titleFocusedRef 记住"用户正在编辑
      // title"，把焦点还给 title input 而不是抢到 CM body。（改名不再走这里——改名不重挂载，
      // 焦点天然留在 title，见上方 renameFromRef 的 early-return。）
      if (titleFocusedRef.current && titleInputRef.current) {
        titleInputRef.current.focus();
        resizeTitleInput();
      } else if (document.activeElement === document.body || document.activeElement === null) {
        const isNewlyCreated = newlyCreatedId === note.id;
        if (isNewlyCreated && titleInputRef.current) {
          titleInputRef.current.focus();
          titleInputRef.current.select();
          resizeTitleInput();
        }
      }
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
  }, [note, newlyCreatedId, onCreateAnimDone, flushContent, flushTitle, resizeTitleInput]);

  const handleContentChange = (value: string) => {
    // applyNote 用 view.dispatch 替换 doc 时也会触发这里的 onChange（CM update listener 不区分 user vs programmatic）。
    // 那次 value === localContentRef.current，直接 return 不启动 debounce，否则会留下 pending → 切笔记时被 flushContent
    // 当成"用户改动"写回 DB → updated_at 被无谓刷新（用户没编辑也变成"刚改过"）
    if (value === localContentRef.current) return;
    const targetId = note?.id;
    if (targetId == null) return;
    localContentRef.current = value;
    setLocalContent(value);
    contentPendingRef.current = { id: targetId, value };
    onLocalContentChange(targetId, value);
    if (contentDebounceRef.current) window.clearTimeout(contentDebounceRef.current);
    contentDebounceRef.current = window.setTimeout(() => {
      flushContent(targetId);
    }, 400);
  };

  // title onChange debounce 600ms 后才调后端 update_note —— Obsidian 风格 rename。
  // debounce 让连续输入合并到一次 rename，避免每字符一次文件改名 + FTS 重建。
  // 代价：list / tab 标题显示有 ~600ms 延迟（input 自己受控显示即时）。
  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let value = e.target.value;
    // 标题是单行：任何换行（含中文输入法确认候选词时漏进来的 Enter）都剥掉，
    // 并即时修正 textarea 显示 + 光标，否则标题会被撑成两行（用户报的「回车变换行」）。
    if (value.includes('\n')) {
      const el = e.target;
      const caret = el.selectionStart;
      value = value.replace(/\n/g, '');
      el.value = value;
      const pos = Math.min(caret, value.length);
      el.setSelectionRange(pos, pos);
    }
    resizeTitleInput();
    titlePendingRef.current = value;
    if (titleDebounceRef.current) window.clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = window.setTimeout(() => flushTitle(), 600);
  };

  useLayoutEffect(() => {
    resizeTitleInput();
  }, [note?.id, note?.title, resizeTitleInput]);

  // 滚动监听：title input 底部滚到 toolbar 下沿之上 → toolbar 显示标题
  useEffect(() => {
    if (noteId == null) return;
    const root = scrollRef.current;
    if (!root) return;
    const memoryKey = `note:${noteId}`;
    const onScroll = () => {
      const titleEl = titleInputRef.current;
      if (!titleEl) return;
      const rootTop = root.getBoundingClientRect().top;
      const titleBottomRel = titleEl.getBoundingClientRect().bottom - rootTop;
      setTitleInToolbar(titleBottomRel < 56);
      rememberSessionScrollPosition(memoryKey, root.scrollTop);
    };
    root.scrollTop = getSessionScrollPosition(memoryKey) ?? 0;
    onScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      rememberSessionScrollPosition(memoryKey, root.scrollTop);
      root.removeEventListener('scroll', onScroll);
    };
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
      <div className={`absolute top-0 left-0 right-0 z-[50] h-12 grid grid-cols-[1fr_auto] items-center gap-3 pl-10 bg-white/70 dark:bg-stone-900/70 backdrop-blur-md transition-[padding] duration-200 ease-out ${aiOpen ? 'pr-[320px]' : 'pr-3'}`}>
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
          {onBack && onForward && (
            <>
            <button
              onClick={onBack}
              disabled={!canBack}
              title="上一篇"
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
              title="下一篇"
              className="w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 disabled:hover:bg-transparent disabled:text-stone-300 disabled:dark:text-stone-600 disabled:cursor-not-allowed transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </button>
            <div className="w-px h-5 bg-black/10 dark:bg-white/10 mx-1.5" />
            </>
          )}
          <button
            onClick={() => {
              const view = cmRef.current?.view;
              if (view) insertTable(view);
            }}
            title="插入表格 (⌘⌥T)"
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
            onMouseDown={(e) => {
              e.preventDefault();
              const view = cmRef.current?.view;
              if (view?.hasFocus) {
                const sel = view.state.selection.main;
                bodySelectionRef.current = { from: sel.from, to: sel.to };
              }
            }}
            onClick={() => {
              const view = cmRef.current?.view;
              if (view) toggleTask(view, bodySelectionRef.current ?? undefined);
            }}
            title="切换待办 / 勾选 (⌘⇧9)"
            className="w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="m9 12 2 2 4-4" />
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
          {onImport && (
            <button
              onClick={onImport}
              title="导入 HTML 文件 / 目录到笔记"
              className="w-8 h-8 flex items-center justify-center rounded-md text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M12 18v-6" />
                <path d="m9 15 3-3 3 3" />
              </svg>
            </button>
          )}
          {onDelete && (
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
          )}
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
            <textarea
              ref={titleInputRef}
              key={mountKey}
              defaultValue={note.title}
              rows={1}
              onChange={handleTitleChange}
              onFocus={() => {
                titleFocusedRef.current = true;
                cmRef.current?.view?.dispatch({ effects: [focusEffect.of(false)] });
              }}
              onBlur={() => { titleFocusedRef.current = false; }}
              onKeyDown={(e) => {
                // 输入法组字中（IME composition）：Enter 是「确认候选词」、ArrowDown 是「翻候选词」，
                // 都该交给输入法，绝不能在这里 preventDefault 跳正文 / 漏掉导致 textarea 插入换行。
                // isComposing 是标准信号；keyCode===229 是 WebKit 组字中的兜底标志。
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                // Enter / ArrowDown 时把焦点切到 body 编辑器，光标定到首行
                // title 是即时保存，无需 flush
                if (e.key === 'Enter' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  titleFocusedRef.current = false;
                  const view = cmRef.current?.view;
                  if (view) {
                    view.focus();
                    view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
                  }
                }
              }}
              placeholder="无标题"
              className="block w-full resize-none overflow-hidden text-[32px] font-bold tracking-tight leading-tight bg-transparent outline-none text-stone-900 dark:text-stone-50 placeholder:text-stone-300 dark:placeholder:text-stone-600"
            />
          </div>
          <div
            className={`relative pl-10 cursor-text transition-[padding] duration-200 ease-out ${aiOpen ? 'pr-[280px]' : ''}`}
            onClick={(e) => {
              // 点击 wrapper 空白区域时进入正文末尾，而不是只 focus。
              // 只 focus 会保留 CodeMirror 上一次 selection；如果上次 selection 在标题行，
              // live preview 会继续认为那行是 active，于是没有点击标题时也露出 "# " 标记。
              if (e.target === e.currentTarget) {
                const view = cmRef.current?.view;
                if (!view) return;
                view.focus();
                view.dispatch({
                  selection: { anchor: view.state.doc.length },
                  scrollIntoView: false,
                });
              }
            }}
          >
            <CodeMirror
              key={mountKey}
              ref={cmRef}
              value={localContent}
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
                drawSelection: false,
                dropCursor: true,
                allowMultipleSelections: false,
                crosshairCursor: false,
                highlightSelectionMatches: false,
                syntaxHighlighting: false,
              }}
              extensions={[
                markdown({ base: markdownLanguage, codeLanguages: [], extensions: [{ remove: ['SetextHeading'] }] }),
                // 空 markup 行（> / - / * / 1.）按 Enter 退出格式，优先于 continuation
                Prec.highest(keymap.of([{ key: 'Enter', run: exitEmptyMarkup }])),
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
                orderedListRenumber,
              ]}
              className={`live-md-editor ${theme === 'dark' ? 'cm-dark' : 'cm-light'}`}
            />
          </div>
        </div>
      </div>
      <TableOfContents content={localContent} title={note.title} cmRef={cmRef} scrollRef={scrollRef} />
      <ConfirmDialog
        open={confirmOpen}
        title="删除笔记"
        description={`确定删除「${note.title || '无标题'}」吗？\n相关附件会被移到系统回收站，可从那里恢复。`}
        confirmLabel="删除"
        variant="danger"
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete?.();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
      <ScrollToTopButton scrollRef={scrollRef} />
    </main>
  );
}
