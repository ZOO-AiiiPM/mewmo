import type { SyntaxNodeRef } from '@lezer/common';
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { Prec, StateField, type EditorState, type Text } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  WidgetType,
} from '@codemirror/view';
import { resolveAttachmentUrl } from './attachments';

class BulletWidget extends WidgetType {
  hollow: boolean;
  constructor(hollow = false) {
    super();
    this.hollow = hollow;
  }
  toDOM() {
    const span = document.createElement('span');
    span.textContent = this.hollow ? '◦' : '•';
    span.className = 'cm-bullet';
    return span;
  }
  eq(other: BulletWidget) {
    return this.hollow === other.hollow;
  }
  ignoreEvent() {
    return false;
  }
}

const bulletDeco = Decoration.replace({ widget: new BulletWidget(false) });
const hollowBulletDeco = Decoration.replace({ widget: new BulletWidget(true) });

// 缓存已解析的 src → 异步 URL，避免每次重渲染重复 invoke
const urlCache = new Map<string, string>();

class ImageWidget extends WidgetType {
  src: string;
  alt: string;
  constructor(src: string, alt: string) {
    super();
    this.src = src;
    this.alt = alt;
  }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-image-wrap';
    wrap.contentEditable = 'false';

    const img = document.createElement('img');
    img.alt = this.alt;
    img.className = 'cm-image';
    img.draggable = false;

    const cached = urlCache.get(this.src);
    if (cached) {
      img.src = cached;
    } else {
      resolveAttachmentUrl(this.src)
        .then(url => {
          urlCache.set(this.src, url);
          img.src = url;
        })
        .catch(err => {
          console.error('resolve attachment failed:', err);
        });
    }

    wrap.appendChild(img);
    return wrap;
  }
  eq(other: ImageWidget) {
    return this.src === other.src && this.alt === other.alt;
  }
  ignoreEvent() {
    return false;
  }
}

// —— GFM 表格 ——
type Align = 'left' | 'center' | 'right' | null;
type TableRange = {
  from: number;
  to: number;
  widgetTo: number;
};

function parseTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      current += '|';
      i++;
    } else if (s[i] === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += s[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

function isTableLine(text: string): boolean {
  return text.includes('|');
}

function tableRangeFromLine(doc: Text, lineNum: number): TableRange | null {
  if (lineNum < 1 || lineNum > doc.lines) return null;
  if (!isTableLine(doc.line(lineNum).text)) return null;

  let startLineNum = lineNum;
  while (startLineNum > 1 && isTableLine(doc.line(startLineNum - 1).text)) {
    startLineNum--;
  }

  let endLineNum = lineNum;
  while (endLineNum < doc.lines && isTableLine(doc.line(endLineNum + 1).text)) {
    endLineNum++;
  }

  const startLine = doc.line(startLineNum);
  const endLine = doc.line(endLineNum);
  return {
    from: startLine.from,
    to: endLine.to,
    widgetTo: endLineNum < doc.lines ? endLine.to + 1 : endLine.to,
  };
}

function tableRangeNearLine(doc: Text, lineNum: number): TableRange | null {
  return (
    tableRangeFromLine(doc, lineNum) ??
    tableRangeFromLine(doc, lineNum + 1) ??
    tableRangeFromLine(doc, lineNum - 1)
  );
}

function tableRangeBetween(doc: Text, from: number, to: number, forward: boolean): TableRange | null {
  const pathFrom = Math.min(from, to);
  const pathTo = Math.max(from, to);
  const startLine = doc.lineAt(Math.min(from, to)).number;
  const endLine = doc.lineAt(Math.max(from, to)).number;
  if (forward) {
    for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
      const range = tableRangeFromLine(doc, lineNum);
      if (range && pathFrom < range.widgetTo && pathTo > range.from) return range;
    }
  } else {
    for (let lineNum = endLine; lineNum >= startLine; lineNum--) {
      const range = tableRangeFromLine(doc, lineNum);
      if (range && pathFrom < range.widgetTo && pathTo > range.from) return range;
    }
  }
  return null;
}

function tableRangeToEnterFromCursor(doc: Text, pos: number, forward: boolean): TableRange | null {
  const line = doc.lineAt(pos);
  const current = tableRangeFromLine(doc, line.number);
  if (current) {
    // At a table boundary, only enter when moving toward the table.
    // Moving up from table.from means "leave upward", not "enter current table again".
    if (forward && pos <= current.from) return current;
    if (!forward && pos >= current.widgetTo) return current;
    return null;
  }

  if (forward) {
    return tableRangeFromLine(doc, line.number + 1);
  }
  return tableRangeFromLine(doc, line.number - 1);
}

function locateTableWrap(view: EditorView, wrap: HTMLElement): TableRange | null {
  try {
    const pos = view.posAtDOM(wrap);
    if (pos < 0 || pos > view.state.doc.length) return null;
    return tableRangeNearLine(view.state.doc, view.state.doc.lineAt(pos).number);
  } catch {
    return null;
  }
}

function collapseCellSelection(cell: HTMLElement, placeAtEnd: boolean) {
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(!placeAtEnd);
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function nearestCell(cells: HTMLElement[], x: number | null): HTMLElement | null {
  if (cells.length === 0) return null;
  if (x == null) return cells[0];
  let best = cells[0];
  let bestDist = Infinity;
  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();
    const clamped = Math.max(rect.left, Math.min(x, rect.right));
    const dist = Math.abs(x - clamped);
    if (dist < bestDist) {
      bestDist = dist;
      best = cell;
    }
  }
  return best;
}

function focusTableWrapCell(
  wrap: HTMLElement,
  edge: 'first' | 'last',
  x: number | null,
): boolean {
  const rows = Array.from(wrap.querySelectorAll<HTMLTableRowElement>('tr'));
  const row = edge === 'first' ? rows[0] : rows[rows.length - 1];
  if (!row) return false;

  const cell = nearestCell(Array.from(row.children) as HTMLElement[], x);
  if (!cell) return false;
  cell.focus();
  collapseCellSelection(cell, edge === 'last');
  return true;
}

function focusRenderedTableCell(
  view: EditorView,
  range: TableRange,
  edge: 'first' | 'last',
  x: number | null,
): boolean {
  const wraps = Array.from(
    view.contentDOM.querySelectorAll<HTMLElement>('.cm-md-table-wrap')
  );
  for (const wrap of wraps) {
    const located = locateTableWrap(view, wrap);
    if (!located || located.from !== range.from) continue;
    return focusTableWrapCell(wrap, edge, x);
  }
  return false;
}

function nearestRenderedTableByCoords(
  view: EditorView,
  forward: boolean,
  coords: { top: number; bottom: number },
): HTMLElement | null {
  const wraps = Array.from(
    view.contentDOM.querySelectorAll<HTMLElement>('.cm-md-table-wrap')
  );
  const cursorY = forward ? coords.bottom : coords.top;
  const maxGap = view.defaultLineHeight * 3;
  let best: HTMLElement | null = null;
  let bestGap = Infinity;

  for (const wrap of wraps) {
    const rect = wrap.getBoundingClientRect();
    const gap = forward ? rect.top - cursorY : cursorY - rect.bottom;
    if (gap < -2 || gap > maxGap) continue;
    if (gap < bestGap) {
      bestGap = gap;
      best = wrap;
    }
  }

  return best;
}

function enterAdjacentTable(view: EditorView, forward: boolean): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty) return false;

  const range = tableRangeToEnterFromCursor(view.state.doc, sel.head, forward);
  const coords = view.coordsAtPos(sel.head, sel.assoc || (forward ? 1 : -1));
  const x = coords ? (coords.left + coords.right) / 2 : null;
  const edge = forward ? 'first' : 'last';

  if (range && focusRenderedTableCell(view, range, edge, x)) return true;

  const moved = view.moveVertically(sel, forward);
  const skippedRange = moved.head === sel.head
    ? null
    : tableRangeBetween(view.state.doc, sel.head, moved.head, forward);
  if (skippedRange && focusRenderedTableCell(view, skippedRange, edge, x)) {
    return true;
  }

  if ((range || skippedRange) && coords) {
    const wrap = nearestRenderedTableByCoords(view, forward, coords);
    if (wrap && focusTableWrapCell(wrap, edge, x)) return true;
  }

  return false;
}

export const tableNavigationKeymap = Prec.high(keymap.of([
  { key: 'ArrowDown', run: view => enterAdjacentTable(view, true) },
  { key: 'ArrowUp', run: view => enterAdjacentTable(view, false) },
]));

function parseAlignments(line: string): Align[] {
  return parseTableRow(line).map(c => {
    const t = c.trim();
    const left = t.startsWith(':');
    const right = t.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

// 在每行末尾追加一列（分隔行追加 ---，普通行追加空白）
function addColumn(src: string): string {
  const lines = src.split('\n');
  // 表格内含 | 的行的索引；其中第二条（idx===1 in tableLineIdx）是分隔行
  const tableLineIdx = lines
    .map((l, i) => (l.includes('|') ? i : -1))
    .filter(i => i >= 0);
  const delimLineIdx = tableLineIdx[1];
  return lines
    .map((line, idx) => {
      if (!line.includes('|')) return line;
      const trimmed = line.trimEnd();
      const isDelim = idx === delimLineIdx;
      const stripped = trimmed.endsWith('|') ? trimmed.slice(0, -1) : trimmed;
      const cell = isDelim ? ' --- ' : '   ';
      return stripped + '|' + cell + '|';
    })
    .join('\n');
}

// 在表格末尾追加一行空白行（按 header 列数）
function addRowBelow(src: string): string {
  const lines = src.split('\n');
  // 头部首行决定列数
  const header = lines.find(l => l.includes('|'));
  if (!header) return src;
  const cols = parseTableRow(header).length;
  const newRow = '|' + '   |'.repeat(cols);
  // 找到最后一条含 | 的行的位置插入
  let lastIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('|')) lastIdx = i;
  }
  if (lastIdx < 0) return src;
  lines.splice(lastIdx + 1, 0, newRow);
  return lines.join('\n');
}

// 删除最右列。要求每行至少保留 1 列；只剩 1 列时不动
function removeColumn(src: string): string {
  const lines = src.split('\n');
  const header = lines.find(l => l.includes('|'));
  if (!header || parseTableRow(header).length <= 1) return src;
  return lines
    .map(line => {
      if (!line.includes('|')) return line;
      const trimmed = line.trimEnd();
      const stripped = trimmed.endsWith('|') ? trimmed.slice(0, -1) : trimmed;
      const lastPipe = stripped.lastIndexOf('|');
      if (lastPipe < 0) return line;
      return stripped.slice(0, lastPipe + 1);
    })
    .join('\n');
}

// 删除最末数据行。要求至少保留 header + 分隔行
function removeLastRow(src: string): string {
  const lines = src.split('\n');
  const tableLineIdx = lines
    .map((l, i) => (l.includes('|') ? i : -1))
    .filter(i => i >= 0);
  if (tableLineIdx.length <= 2) return src;
  const lastIdx = tableLineIdx[tableLineIdx.length - 1];
  lines.splice(lastIdx, 1);
  return lines.join('\n');
}

// 给外部使用：在当前光标位置插入一个 rows×cols 的空白表格（rows 含表头）
export function insertTable(view: EditorView, rows = 3, cols = 2) {
  const head = '|' + '   |'.repeat(cols);
  const sep = '|' + ' --- |'.repeat(cols);
  const empty = '|' + '   |'.repeat(cols);
  const body = Array.from({ length: Math.max(0, rows - 1) }, () => empty).join('\n');
  const block = body ? `${head}\n${sep}\n${body}` : `${head}\n${sep}`;
  const { state } = view;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  // 当前行非空 → 另起一行；否则就地插入
  const lineText = state.doc.sliceString(line.from, line.to);
  const prefix = lineText.length > 0 ? '\n\n' : '';
  const suffix = '\n';
  const insertPos = line.to;
  const insert = `${prefix}${block}${suffix}`;
  view.dispatch({
    changes: { from: insertPos, to: insertPos, insert },
    // 把光标放到第一个数据格内（粗略：表格起始 + 2 即第一个 | 后）
    selection: { anchor: insertPos + prefix.length + 2 },
    scrollIntoView: true,
  });
  view.focus();
}

// 给外部使用：把当前行切换为/取消待办，或切换勾选状态
export function toggleTask(view: EditorView) {
  const { state } = view;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const text = line.text;

  // 已是任务项 → 翻转勾选
  let m = text.match(/^(\s*)([-*+])\s+\[([ xX])\]\s/);
  if (m) {
    const [full, indent, bullet, mark] = m;
    const newMark = mark.toLowerCase() === 'x' ? ' ' : 'x';
    const next = `${indent}${bullet} [${newMark}] `;
    view.dispatch({
      changes: { from: line.from, to: line.from + full.length, insert: next },
    });
    view.focus();
    return;
  }

  // 普通无序列表 → 升级为任务项
  m = text.match(/^(\s*)([-*+])\s+/);
  if (m) {
    const [full, indent, bullet] = m;
    const next = `${indent}${bullet} [ ] `;
    view.dispatch({
      changes: { from: line.from, to: line.from + full.length, insert: next },
    });
    view.focus();
    return;
  }

  // 空行或纯文本 → 行首插入 "- [ ] "
  const indentMatch = text.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '';
  const insert = `- [ ] `;
  view.dispatch({
    changes: {
      from: line.from + indent.length,
      to: line.from + indent.length,
      insert,
    },
    selection: { anchor: line.from + indent.length + insert.length + (text.length - indent.length) },
    scrollIntoView: true,
  });
  view.focus();
}

class TaskWidget extends WidgetType {
  checked: boolean;
  constructor(checked: boolean) {
    super();
    this.checked = checked;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-task-checkbox';
    wrap.contentEditable = 'false';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = this.checked;
    // mousedown 阻止默认，避免 CodeMirror 把焦点抢走 / 选中
    cb.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
    });
    cb.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const pos = view.posAtDOM(wrap);
      // 该位置应当指向 '[' 字符；读 3 字符确认
      const slice = view.state.doc.sliceString(pos, pos + 3);
      const mm = slice.match(/^\[([ xX])\]$/);
      if (!mm) return;
      const next = mm[1].toLowerCase() === 'x' ? ' ' : 'x';
      view.dispatch({
        changes: { from: pos + 1, to: pos + 2, insert: next },
      });
    });
    wrap.appendChild(cb);
    return wrap;
  }
  eq(other: TaskWidget) {
    return this.checked === other.checked;
  }
  ignoreEvent() {
    return false;
  }
}

class TableWidget extends WidgetType {
  source: string;
  constructor(source: string) {
    super();
    this.source = source;
  }
  // 用 widget DOM 在文档中的位置，反查表格当前的 from/to（避免缓存的位置因外部编辑失效）
  private locate(view: EditorView, wrap: HTMLElement): TableRange | null {
    // wrap 已脱离当前 view（widget 在 buildDecorations 重建时被换掉、或 doc 已大幅替换）→
    // posAtDOM 返回越界值，lineAt 抛 RangeError 让整个 webview 卡死。
    // 全部用 try 包住，失败放弃这次同步——cell 内容回写丢一次远好过应用崩溃。
    return locateTableWrap(view, wrap);
  }
  private rewrite(view: EditorView, wrap: HTMLElement, transform: (src: string) => string) {
    const range = this.locate(view, wrap);
    if (!range) return;
    const current = view.state.doc.sliceString(range.from, range.to);
    const next = transform(current);
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: next },
    });
  }
  private markdownFromDOM(wrap: HTMLElement): string | null {
    const tbl = wrap.querySelector('table.cm-md-table') as HTMLTableElement | null;
    if (!tbl) return null;
    const aligns = parseAlignments(
      this.source.split('\n').filter(l => l.includes('|'))[1] ?? ''
    );
    const escape = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
    const cellsOf = (root: ParentNode, sel: string) =>
      Array.from(root.querySelectorAll(sel)).map(el => escape(el.textContent ?? ''));
    const headerCells = cellsOf(tbl, 'thead th');
    const bodyRows = Array.from(tbl.querySelectorAll('tbody tr')).map(tr =>
      cellsOf(tr, 'td')
    );
    const cols = headerCells.length;
    const sep = aligns.slice(0, cols).map(a => {
      if (a === 'center') return ':---:';
      if (a === 'left') return ':---';
      if (a === 'right') return '---:';
      return '---';
    });
    while (sep.length < cols) sep.push('---');
    const lineFor = (cells: string[]) =>
      '| ' + Array.from({ length: cols }, (_, i) => cells[i] || ' ').join(' | ') + ' |';
    const lines = [
      lineFor(headerCells),
      '| ' + sep.join(' | ') + ' |',
      ...bodyRows.map(lineFor),
    ];
    return lines.join('\n');
  }
  // 把 widget DOM 里 cells 的内容回写到 markdown（焦点离开整张表才调一次）
  private syncToMarkdown(
    view: EditorView,
    wrap: HTMLElement,
    selectionSide?: 'before' | 'after',
  ) {
    const range = this.locate(view, wrap);
    if (!range) return;
    const next = this.markdownFromDOM(wrap);
    if (next == null) return;

    const current = view.state.doc.sliceString(range.from, range.to);
    const changed = next !== current;
    if (!changed && !selectionSide) return;

    const selection =
      selectionSide === 'before'
        ? { anchor: range.from }
        : selectionSide === 'after'
          ? { anchor: range.from + next.length + (range.widgetTo > range.to ? 1 : 0) }
          : undefined;

    view.dispatch({
      changes: changed ? { from: range.from, to: range.to, insert: next } : undefined,
      selection,
      scrollIntoView: Boolean(selection),
    });
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-md-table-wrap';
    // wrap 自身不可编辑，让 CodeMirror 不把它当文档内容；但子元素 cells 可以单独 contentEditable
    wrap.contentEditable = 'false';

    const lines = this.source
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && l.includes('|'));

    if (lines.length < 2) {
      wrap.textContent = this.source;
      return wrap;
    }

    const header = parseTableRow(lines[0]);
    const aligns = parseAlignments(lines[1]);
    const body = lines.slice(2).map(parseTableRow);

    const table = document.createElement('table');
    table.className = 'cm-md-table';

    // cell 之间导航：focus 目标 cell + 把光标定位到指定端
    const navigate = (
      from: HTMLElement,
      dir: 'up' | 'down' | 'left' | 'right' | 'next' | 'prev'
    ) => {
      const tr = from.parentElement as HTMLTableRowElement | null;
      if (!tr) return;
      const allRows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
      const rowIdx = allRows.indexOf(tr);
      const cells = Array.from(tr.children) as HTMLElement[];
      const colIdx = cells.indexOf(from);
      let target: HTMLElement | null = null;
      let placeAtEnd = false;
      if (dir === 'up' && rowIdx > 0) {
        target = allRows[rowIdx - 1].children[colIdx] as HTMLElement;
      } else if (dir === 'down' && rowIdx < allRows.length - 1) {
        target = allRows[rowIdx + 1].children[colIdx] as HTMLElement;
      } else if (dir === 'left' || dir === 'prev') {
        if (colIdx > 0) {
          target = cells[colIdx - 1];
          placeAtEnd = dir === 'left';
        } else if (rowIdx > 0) {
          const prev = allRows[rowIdx - 1];
          target = prev.children[prev.children.length - 1] as HTMLElement;
          placeAtEnd = dir === 'left';
        }
      } else if (dir === 'right' || dir === 'next') {
        if (colIdx < cells.length - 1) {
          target = cells[colIdx + 1];
        } else if (rowIdx < allRows.length - 1) {
          target = allRows[rowIdx + 1].children[0] as HTMLElement;
        }
      }
      if (!target) {
        if (dir === 'up') {
          this.syncToMarkdown(view, wrap, 'before');
          view.focus();
        } else if (dir === 'down') {
          this.syncToMarkdown(view, wrap, 'after');
          view.focus();
        }
        return;
      }
      target.focus();
      collapseCellSelection(target, placeAtEnd);
    };

    // cell 渲染：空文本用 &nbsp; 撑住高度，contentEditable 让用户直接键入
    const fillCell = (el: HTMLElement, text: string) => {
      el.contentEditable = 'true';
      el.spellcheck = false;
      if (text.length === 0) {
        el.innerHTML = '&nbsp;';
      } else {
        el.textContent = text;
      }
      // 进入 cell 时清掉占位 nbsp，避免出现在用户输入前面
      el.addEventListener('focus', () => {
        if (el.textContent === ' ') {
          el.textContent = '';
          view.requestMeasure();
        }
      });
      el.addEventListener('blur', () => {
        if ((el.textContent ?? '').length === 0) {
          el.innerHTML = '&nbsp;';
          view.requestMeasure();
        }
      });
      // 方向键 / Tab / Enter 在 cells 间跳转
      el.addEventListener('keydown', e => {
        // 阻止冒泡到 CM 的 keymap，避免 CM 同时处理这些键（导致 cursor 错位 / 编辑器抢焦点）
        e.stopPropagation();
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          navigate(el, 'up');
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          navigate(el, 'down');
        } else if (e.key === 'ArrowLeft') {
          const sel = window.getSelection();
          if (sel && sel.isCollapsed && sel.anchorOffset === 0) {
            e.preventDefault();
            navigate(el, 'left');
          }
        } else if (e.key === 'ArrowRight') {
          const sel = window.getSelection();
          const len = (el.textContent ?? '').length;
          if (sel && sel.isCollapsed && sel.anchorOffset === len) {
            e.preventDefault();
            navigate(el, 'right');
          }
        } else if (e.key === 'Tab') {
          e.preventDefault();
          navigate(el, e.shiftKey ? 'prev' : 'next');
        } else if (e.key === 'Enter') {
          e.preventDefault();
          navigate(el, 'down');
        }
      });
      // 鼠标点击事件不要让 CM 看见，避免 CM 把 cell 当成空 widget 区域去重新放置 cursor
      el.addEventListener('mousedown', e => e.stopPropagation());
      el.addEventListener('input', e => {
        e.stopPropagation();
        view.requestMeasure();
      });
    };

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    header.forEach((cell, i) => {
      const th = document.createElement('th');
      fillCell(th, cell);
      const a = aligns[i];
      if (a) th.style.textAlign = a;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    body.forEach(row => {
      const tr = document.createElement('tr');
      for (let i = 0; i < header.length; i++) {
        const td = document.createElement('td');
        fillCell(td, row[i] ?? '');
        const a = aligns[i];
        if (a) td.style.textAlign = a;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);

    // 焦点离开整张表才把 DOM 内容回写 markdown，避免 cell 间切换时 widget 重建丢光标
    wrap.addEventListener('focusout', e => {
      const next = e.relatedTarget as Element | null;
      if (next && wrap.contains(next)) return;
      this.syncToMarkdown(view, wrap);
    });

    // hover 浮出的 +列 / −列 / +行 / −行 按钮
    const mkBtn = (cls: string, label: string, title: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = cls;
      b.title = title;
      b.textContent = label;
      b.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
      wrap.appendChild(b);
    };
    mkBtn('cm-md-table-add-col', '+', '添加列', () =>
      this.rewrite(view, wrap, src => addColumn(src))
    );
    mkBtn('cm-md-table-remove-col', '−', '删除最右列', () =>
      this.rewrite(view, wrap, src => removeColumn(src))
    );
    mkBtn('cm-md-table-add-row', '+', '添加行', () =>
      this.rewrite(view, wrap, src => addRowBelow(src))
    );
    mkBtn('cm-md-table-remove-row', '−', '删除末行', () =>
      this.rewrite(view, wrap, src => removeLastRow(src))
    );

    return wrap;
  }
  eq(other: TableWidget) {
    return this.source === other.source;
  }
  // cells 自己用 stopPropagation 隔离输入；这里返回 false 让 CM 能正常处理 widget 周围的 click
  // （返回 true 会让 CM 完全忽略 widget 范围的事件，导致 widget 附近的 cursor 定位失效）
  ignoreEvent() {
    return false;
  }
}

/**
 * Live Preview decoration plugin
 *
 * 行为：
 * - 光标所在行：显示原始 markdown 标记（** _ ` # 等），用淡色样式
 * - 光标不在的行：把标记字符隐藏，文本套上视觉样式（粗体 / 斜体 / 标题等）
 *
 * 类似 Obsidian Live Preview / Typora 的混合编辑模式。
 */

const headingClasses: Record<number, string> = {
  1: 'cm-h1',
  2: 'cm-h2',
  3: 'cm-h3',
  4: 'cm-h4',
  5: 'cm-h5',
  6: 'cm-h6',
};

// buildDecorations 主 traversal 跟 10 个 per-decoration helper 共享的工作集。
// items 累加最终结果；lezerEmphasisRanges / lezerListMarkPositions 是 lezer pass
// 收集给后续 regex patches 用的「已识别集合」，避免重复装饰。
type Item = { from: number; to: number; deco: Decoration };

interface DecorationCtx {
  state: EditorState;
  cursorLine: number;
  items: Item[];
  lezerEmphasisRanges: Array<[number, number]>;
  lezerListMarkPositions: Set<number>;
}

function isCursorOnNode(node: SyntaxNodeRef, ctx: DecorationCtx): boolean {
  const fromLine = ctx.state.doc.lineAt(node.from).number;
  const toLine = ctx.state.doc.lineAt(node.to).number;
  return ctx.cursorLine >= fromLine && ctx.cursorLine <= toLine;
}

// ── lezer 整段节点：套样式 mark（不依赖光标） ──
function handleEntireNodeStyle(node: SyntaxNodeRef, ctx: DecorationCtx) {
  const name = node.name;
  if (name === 'StrongEmphasis') {
    ctx.lezerEmphasisRanges.push([node.from, node.to]);
    ctx.items.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-strong' }) });
  } else if (name === 'Emphasis') {
    ctx.lezerEmphasisRanges.push([node.from, node.to]);
    ctx.items.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-em' }) });
  } else if (name === 'Strikethrough') {
    ctx.items.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-strike' }) });
  } else if (name === 'InlineCode') {
    ctx.items.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-inline-code' }) });
  } else if (name === 'Blockquote') {
    ctx.items.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-blockquote' }) });
  } else if (name === 'Link' || name === 'Autolink') {
    // Autolink (CommonMark <url> 形式)：整段（含尖括号）套链接样式
    ctx.items.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-link' }) });
  } else if (/^ATXHeading[1-6]$/.test(name)) {
    // CommonMark 允许 "###" 单独一行算空 heading，但用户体验上"#"没空格就变大很突兀
    // 要求 # 后必须跟空格才套大字号样式（空格之后即使还没输文字也立刻渲染）
    const text = ctx.state.doc.sliceString(node.from, node.to);
    const m = text.match(/^(#{1,6})\s/);
    if (m) {
      const level = m[1].length;
      ctx.items.push({
        from: node.from,
        to: node.to,
        deco: Decoration.mark({ class: headingClasses[level] }),
      });
    }
  }
}

// ── lezer Image 节点 ──
// 光标在该 Image 节点的行上时，显示原 markdown 让用户编辑；
// 否则用 widget 把 ![alt](src) 整段替换为 <img>。
// 返回 true 表示跳过子节点（避免 URL / LinkMark 子节点被另规则隐藏，造成 widget 范围错乱）。
function handleImage(node: SyntaxNodeRef, ctx: DecorationCtx): boolean {
  if (isCursorOnNode(node, ctx)) return false;

  const text = ctx.state.doc.sliceString(node.from, node.to);
  const m = text.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
  if (!m) return false;

  const [, alt, src] = m;
  ctx.items.push({
    from: node.from,
    to: node.to,
    deco: Decoration.replace({ widget: new ImageWidget(src, alt) }),
  });
  return true;
}

// ── lezer Table 节点 ──
// 表格永远渲染成 widget；cell 内的 contentEditable 提供编辑能力，不再依赖光标位置切换原文/视图。
//
// 防御性边界：完全不信任 lezer-markdown Table 节点的 from/to。实测 lezer 在表格末行后
// 紧接非空段落（无空行分隔）时，会把后续整段 paragraph 都吞进 Table 节点的 .to。直接用
// lineAt(node.to) 会让 block widget replace 跨越多行非表格内容，表现为：用户在表格下方
// 输入的文字看不见 / 光标上下移动跳过那几行 / "无法保存"。
// 自己以"含 | 的连续行"为唯一表格边界，跳过 lezer 给的范围。
//
// CM 6 硬性要求：block decoration 的 from/to 必须在行边界（行首或文档末尾）。endLine.to
// 是行尾（newline 之前），不是下一行的行首，差 1 个字符。这 1 个字符让 CM 在 widget 之后
// 的 vertical motion 计算错位——光标按 ↑/↓ 跳过 widget 之后的 1 行 / 多行（取决于错位累积
// 多少）。widgetTo 必须延伸到下一行行首（含 trailing newline）；文档最末行直接到 doc 末尾。
//
// 返回 true 跳过子节点。
function handleTable(node: SyntaxNodeRef, ctx: DecorationCtx): boolean {
  const range = tableRangeNearLine(ctx.state.doc, ctx.state.doc.lineAt(node.from).number);
  if (!range) return false;

  const text = ctx.state.doc.sliceString(range.from, range.to);
  ctx.items.push({
    from: range.from,
    to: range.widgetTo,
    deco: Decoration.replace({
      widget: new TableWidget(text),
      block: true,
    }),
  });
  return true;
}

// ── 行内格式标记隐藏（**, *, ~~, `）：光标不在所属节点时才隐藏 ──
function handleInlineMarkHide(node: SyntaxNodeRef, ctx: DecorationCtx) {
  if (isCursorOnNode(node, ctx)) return;
  ctx.items.push({
    from: node.from,
    to: node.to,
    deco: Decoration.replace({}),
  });
}

// ── 行首结构标记 # ──
// Obsidian 风 live preview——光标在该行时保留显示井号 + 空格，切到其他行才隐藏；
// 点击该行时光标进入，井号 + 空格再次出现。
function handleHeaderMark(node: SyntaxNodeRef, ctx: DecorationCtx) {
  const line = ctx.state.doc.lineAt(node.from);
  const lineText = ctx.state.doc.sliceString(line.from, line.to);
  if (!/^#{1,6}\s/.test(lineText)) return;
  if (ctx.cursorLine === line.number) return;

  let hideTo = node.to;
  const next = ctx.state.doc.sliceString(node.to, node.to + 1);
  if (next === ' ') hideTo += 1;
  ctx.items.push({
    from: node.from,
    to: hideTo,
    deco: Decoration.replace({}),
  });
}

// ── 列表标记 ──
// 严格判定：必须 [-*+] + 空格 才识别为列表（光标后空格一打出就立即渲染，不要求内容；
// 用户输 "-" 没空格时保留原字符）。
// 任务项 (- [ ] foo / - [x] foo) → 隐藏前缀 "- "，由 TaskMarker widget 取代。
// 普通列表 → 数 BulletList / OrderedList 祖先深度选实心 / 空心。
function handleListMark(node: SyntaxNodeRef, ctx: DecorationCtx) {
  const text = ctx.state.doc.sliceString(node.from, node.to);
  if (!/^[-*+]$/.test(text)) return;

  const line = ctx.state.doc.lineAt(node.from);
  const lineText = ctx.state.doc.sliceString(line.from, line.to);
  if (!/^\s*[-*+]\s/.test(lineText)) return;

  ctx.lezerListMarkPositions.add(node.from);

  if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(lineText)) {
    // 任务项 → 隐藏 "- " 前缀
    const next = ctx.state.doc.sliceString(node.to, node.to + 1);
    const hideTo = next === ' ' ? node.to + 1 : node.to;
    ctx.items.push({
      from: node.from,
      to: hideTo,
      deco: Decoration.replace({}),
    });
    return;
  }

  // 普通列表：数嵌套深度
  let depth = 0;
  let cur = node.node.parent;
  while (cur) {
    if (cur.name === 'BulletList' || cur.name === 'OrderedList') {
      depth++;
    }
    cur = cur.parent;
  }
  ctx.items.push({
    from: node.from,
    to: node.to,
    deco: depth >= 2 ? hollowBulletDeco : bulletDeco,
  });
}

// ── 任务标记 [ ] / [x] → 替换为可勾选 checkbox ──
function handleTaskMarker(node: SyntaxNodeRef, ctx: DecorationCtx) {
  const text = ctx.state.doc.sliceString(node.from, node.to);
  const checked = /\[[xX]\]/.test(text);
  ctx.items.push({
    from: node.from,
    to: node.to,
    deco: Decoration.replace({ widget: new TaskWidget(checked) }),
  });

  if (!checked) return;
  // 已完成 → 行内剩余文本套灰色删除线
  const line = ctx.state.doc.lineAt(node.from);
  const tailFrom = node.to + (ctx.state.doc.sliceString(node.to, node.to + 1) === ' ' ? 1 : 0);
  if (tailFrom < line.to) {
    ctx.items.push({
      from: tailFrom,
      to: line.to,
      deco: Decoration.mark({ class: 'cm-task-done' }),
    });
  }
}

// ── 链接的 url 部分 ──
// [text](url) 形式：光标不在时隐藏 url（仅显示 link text）。
// 裸 URL（GFM autolink）的顶层 URL 节点父节点不是 Link，永远显示并套上链接样式。
function handleUrl(node: SyntaxNodeRef, ctx: DecorationCtx) {
  const parent = node.node.parent;
  const isInLink = parent && parent.name === 'Link';

  if (isInLink) {
    if (isCursorOnNode(node, ctx)) return;
    ctx.items.push({
      from: node.from,
      to: node.to,
      deco: Decoration.replace({}),
    });
  } else {
    ctx.items.push({
      from: node.from,
      to: node.to,
      deco: Decoration.mark({ class: 'cm-link' }),
    });
  }
}

// ── 链接的 [ ] ( ) ——光标不在所属链接时才隐藏 ──
function handleLinkMark(node: SyntaxNodeRef, ctx: DecorationCtx) {
  if (isCursorOnNode(node, ctx)) return;
  ctx.items.push({
    from: node.from,
    to: node.to,
    deco: Decoration.replace({}),
  });
}

// ── regex 补丁：lezer-markdown 不识别紧贴 unicode word char 的 emphasis ──
// 例：`这是*斜体*` 中 `*` 紧贴中文，CommonMark 规则不识别为 Emphasis。手动扫描补 mark。
// 跳过 lezer 已识别范围避免重复装饰。
// 注意：regex 不能跨行匹配 emphasis（合规 markdown 不允许跨行），用 [^*\n] 限制。
function patchUnicodeEmphasis(ctx: DecorationCtx) {
  const docText = ctx.state.doc.toString();
  const isInLezerRange = (from: number, to: number) =>
    ctx.lezerEmphasisRanges.some(([f, t]) => from >= f && to <= t);

  // 先扫 ** ** （strong），再扫 * *（em）—— 顺序很重要，避免 ** 内层 * 误识别
  const strongRe = /\*\*([^*\n]+?)\*\*/g;
  let sm: RegExpExecArray | null;
  while ((sm = strongRe.exec(docText)) !== null) {
    const mFrom = sm.index;
    const mTo = sm.index + sm[0].length;
    if (isInLezerRange(mFrom, mTo)) continue;
    ctx.items.push({ from: mFrom, to: mTo, deco: Decoration.mark({ class: 'cm-strong' }) });
    // 隐藏 ** （光标不在该行）
    const line = ctx.state.doc.lineAt(mFrom);
    if (ctx.cursorLine !== line.number) {
      ctx.items.push({ from: mFrom, to: mFrom + 2, deco: Decoration.replace({}) });
      ctx.items.push({ from: mTo - 2, to: mTo, deco: Decoration.replace({}) });
    }
    ctx.lezerEmphasisRanges.push([mFrom, mTo]);
  }

  // em：避免误吃 strong 已处理过的 ** （isInLezerRange 已含 strong 范围）
  const emRe = /\*([^*\n]+?)\*/g;
  let em: RegExpExecArray | null;
  while ((em = emRe.exec(docText)) !== null) {
    const mFrom = em.index;
    const mTo = em.index + em[0].length;
    if (isInLezerRange(mFrom, mTo)) continue;
    ctx.items.push({ from: mFrom, to: mTo, deco: Decoration.mark({ class: 'cm-em' }) });
    const line = ctx.state.doc.lineAt(mFrom);
    if (ctx.cursorLine !== line.number) {
      ctx.items.push({ from: mFrom, to: mFrom + 1, deco: Decoration.replace({}) });
      ctx.items.push({ from: mTo - 1, to: mTo, deco: Decoration.replace({}) });
    }
  }
}

// ── regex 补丁：lezer 对"`- ` 后无内容"的空 list item 不识别成 ListMark ──
// 扫每行行首，匹配 `[-*+] + 空格`，且位置不在 lezer 已识别集合里 → 手动渲染圆点
function patchEmptyListMark(ctx: DecorationCtx) {
  const totalLines = ctx.state.doc.lines;
  for (let lineNum = 1; lineNum <= totalLines; lineNum++) {
    const line = ctx.state.doc.line(lineNum);
    const m = line.text.match(/^(\s*)([-*+])\s/);
    if (!m) continue;
    const markerPos = line.from + m[1].length;
    if (ctx.lezerListMarkPositions.has(markerPos)) continue;
    // 任务项格式 `- [ ] / - [x]` 整体由 TaskMarker widget 处理，跳过
    if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(line.text)) continue;
    ctx.items.push({
      from: markerPos,
      to: markerPos + 1,
      deco: bulletDeco,
    });
  }
}

function buildDecorations(state: EditorState): DecorationSet {
  const ctx: DecorationCtx = {
    state,
    cursorLine: state.doc.lineAt(state.selection.main.head).number,
    items: [],
    lezerEmphasisRanges: [],
    lezerListMarkPositions: new Set(),
  };

  // 强制解析到文档尾，避免初次切换笔记时 syntax tree 还没含 Table / TaskMarker 节点 → 装饰漏建
  ensureSyntaxTree(state, state.doc.length, 50);

  // StateField 不能限制为 visibleRanges（无法访问 view）；笔记体量小，整文档遍历可接受。
  // enter 函数本身只做 dispatch，每类节点由 handleXXX helper 处理；返回 false 跳过子节点。
  syntaxTree(state).iterate({
    enter(node) {
      const name = node.name;

      // 整段节点 mark / heading / blockquote / link
      if (
        name === 'StrongEmphasis' ||
        name === 'Emphasis' ||
        name === 'Strikethrough' ||
        name === 'InlineCode' ||
        name === 'Blockquote' ||
        name === 'Link' ||
        name === 'Autolink' ||
        /^ATXHeading[1-6]$/.test(name)
      ) {
        handleEntireNodeStyle(node, ctx);
        return;
      }

      // 复合节点（widget + 跳过 children）
      if (name === 'Image') {
        if (handleImage(node, ctx)) return false;
        return;
      }
      if (name === 'Table') {
        if (handleTable(node, ctx)) return false;
        return;
      }

      // 行内格式标记（**, *, ~~, `）
      if (name === 'EmphasisMark' || name === 'StrikethroughMark' || name === 'CodeMark') {
        handleInlineMarkHide(node, ctx);
        return;
      }
      if (name === 'HeaderMark') {
        handleHeaderMark(node, ctx);
        return;
      }
      if (name === 'ListMark') {
        handleListMark(node, ctx);
        return;
      }
      if (name === 'TaskMarker') {
        handleTaskMarker(node, ctx);
        return;
      }
      if (name === 'URL') {
        handleUrl(node, ctx);
        return;
      }
      if (name === 'LinkMark') {
        handleLinkMark(node, ctx);
        return;
      }
    },
  });

  // regex patches 处理 lezer 漏识别的 case
  patchUnicodeEmphasis(ctx);
  patchEmptyListMark(ctx);

  // 不能手工 sort 后塞 RangeSetBuilder：CM 的 builder 还要求同 from 位置上 startSide 升序，
  // 而 startSide 是 Decoration 的内部属性（mark/replace/block 各不相同），按业务字段没法排对。
  // 交给 Decoration.set(ranges, true) 让 CM 自己用完整规则排，是公开 API 的标准用法。
  return Decoration.set(ctx.items.map(it => it.deco.range(it.from, it.to)), true);
}

// block widgets 必须通过 StateField 注入，ViewPlugin 提供的会被静默丢弃
export const livePreview = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state);
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selection) {
      return buildDecorations(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f),
});
