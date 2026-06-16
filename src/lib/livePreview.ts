import type { SyntaxNodeRef } from '@lezer/common';
import { syntaxTree } from '@codemirror/language';
import { Facet, Prec, StateEffect, StateField, type EditorState, type Text, type Transaction } from '@codemirror/state';
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
  width: number | null;
  from: number;
  to: number;
  constructor(src: string, alt: string, width: number | null, from: number, to: number) {
    super();
    this.src = src;
    this.alt = alt;
    this.width = width;
    this.from = from;
    this.to = to;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-image-wrap';
    wrap.contentEditable = 'false';

    const img = document.createElement('img');
    img.alt = this.alt;
    img.className = 'cm-image';
    img.draggable = false;
    if (this.width) img.style.width = `${this.width}px`;

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

    // resize handle
    const handle = document.createElement('span');
    handle.className = 'cm-image-resize-handle';

    // click to select
    wrap.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll('.cm-image-selected').forEach(el => el.classList.remove('cm-image-selected'));
      wrap.classList.add('cm-image-selected');
    });

    // click outside to deselect; keydown to delete
    const cleanup = () => {
      wrap.classList.remove('cm-image-selected');
      document.removeEventListener('mousedown', deselect);
      document.removeEventListener('keydown', onKey);
    };
    const deselect = (e: MouseEvent) => {
      if (!wrap.contains(e.target as Node)) cleanup();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        cleanup();
        view.dispatch({ changes: { from: widgetFrom, to: widgetTo, insert: '' } });
      } else if (e.key === 'Escape') {
        cleanup();
      }
    };
    wrap.addEventListener('mousedown', () => {
      setTimeout(() => {
        document.addEventListener('mousedown', deselect);
        document.addEventListener('keydown', onKey);
      }, 0);
    });

    // drag to resize
    const widgetFrom = this.from;
    const widgetTo = this.to;
    const altText = this.alt;
    const srcText = this.src;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = img.offsetWidth;

      const onMove = (ev: MouseEvent) => {
        const newW = Math.max(60, startW + (ev.clientX - startX));
        img.style.width = `${newW}px`;
      };
      const onUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const finalW = Math.max(60, startW + (ev.clientX - startX));
        const newAlt = altText ? `${altText}|${finalW}` : `|${finalW}`;
        const newText = `![${newAlt}](${srcText})`;
        view.dispatch({ changes: { from: widgetFrom, to: widgetTo, insert: newText } });
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    wrap.appendChild(img);
    wrap.appendChild(handle);
    return wrap;
  }
  eq(other: ImageWidget) {
    return this.src === other.src && this.alt === other.alt && this.width === other.width;
  }
  ignoreEvent() {
    return true;
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

// 写纯文本到剪贴板：用隐藏 textarea + execCommand('copy')。
// 不走 copy 事件——多格选区时聚焦格只有收起的光标（没原生选区），execCommand 对空选区
// 不触发 copy 事件，会导致"空内容 / 没选中文字时复制不出来"。textarea 自带可选内容，
// 无论单元格空不空都能稳定复制。复制后复原焦点，避免表格选区视觉掉焦。
function copyPlainText(text: string): boolean {
  const active = document.activeElement as HTMLElement | null;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok: boolean;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  if (active && document.contains(active)) active.focus();
  return ok;
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

// 删除整张表：从 range.from 删到 widgetTo（含尾随换行，不留空行）。
function deleteTableAtRange(view: EditorView, range: TableRange) {
  view.dispatch({
    changes: { from: range.from, to: range.widgetTo, insert: '' },
    selection: { anchor: range.from },
  });
  view.focus();
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

// 给外部使用：把当前行（或选中的多行）切换为/取消待办
// 已是任务项（无论 [ ] 或 [x]）→ 移除 checkbox 前缀变回纯文本
// 纯文本/无序列表 → 加上 - [ ] 前缀
export function toggleTask(view: EditorView) {
  const { state } = view;
  const { from, to } = state.selection.main;
  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(to);

  const changes: Array<{ from: number; to: number; insert: string }> = [];

  for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
    const line = state.doc.line(lineNum);
    const text = line.text;

    // 已是任务项 → 移除 checkbox 前缀，变回纯文本
    const m = text.match(/^(\s*)([-*+])\s+\[([ xX])\]\s/);
    if (m) {
      const [full, indent] = m;
      changes.push({ from: line.from, to: line.from + full.length, insert: indent });
      continue;
    }

    // 普通无序列表 → 升级为任务项
    const listMatch = text.match(/^(\s*)([-*+])\s+/);
    if (listMatch) {
      const [full, indent, bullet] = listMatch;
      const next = `${indent}${bullet} [ ] `;
      changes.push({ from: line.from, to: line.from + full.length, insert: next });
      continue;
    }

    // 纯文本或空行 → 行首插入 "- [ ] "
    const indentMatch = text.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    changes.push({ from: line.from + indent.length, to: line.from + indent.length, insert: '- [ ] ' });
  }

  if (changes.length) {
    view.dispatch({ changes });
  }
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

type CellCoord = { r: number; c: number };

class TableWidget extends WidgetType {
  source: string;
  // 矩形选区：anchor=按下的格，focus=拖到的格。每个 cell 是独立 contentEditable，浏览器
  // 原生 selection 无法跨多个 editing host，所以多格选区完全自己维护（CSS class 高亮 +
  // 复制时按矩形重组 markdown）。单格（anchor==focus）不算多选，走原生编辑。
  private selAnchor: CellCoord | null = null;
  private selFocus: CellCoord | null = null;
  constructor(source: string) {
    super();
    this.source = source;
  }
  private cellCoord(table: HTMLTableElement, cell: HTMLElement): CellCoord | null {
    const tr = cell.parentElement;
    if (!tr) return null;
    const rows = Array.from(table.querySelectorAll('tr'));
    const r = rows.indexOf(tr as HTMLTableRowElement);
    const c = Array.from(tr.children).indexOf(cell);
    if (r < 0 || c < 0) return null;
    return { r, c };
  }
  private selectionRect(): { r1: number; r2: number; c1: number; c2: number } | null {
    const a = this.selAnchor;
    const f = this.selFocus;
    if (!a || !f) return null;
    return {
      r1: Math.min(a.r, f.r),
      r2: Math.max(a.r, f.r),
      c1: Math.min(a.c, f.c),
      c2: Math.max(a.c, f.c),
    };
  }
  private isMultiSelection(): boolean {
    const rect = this.selectionRect();
    return !!rect && !(rect.r1 === rect.r2 && rect.c1 === rect.c2);
  }
  private applyHighlight(table: HTMLTableElement) {
    const rect = this.selectionRect();
    const multi = !!rect && !(rect.r1 === rect.r2 && rect.c1 === rect.c2);
    table.classList.toggle('cm-md-table-rangesel', multi);
    const rows = Array.from(table.querySelectorAll('tr'));
    rows.forEach((tr, r) => {
      Array.from(tr.children).forEach((cellEl, c) => {
        const on =
          multi && rect && r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2;
        (cellEl as HTMLElement).classList.toggle('cm-md-cell-sel', !!on);
      });
    });
  }
  private clearSelection(table: HTMLTableElement) {
    this.selAnchor = null;
    this.selFocus = null;
    this.applyHighlight(table);
  }
  // 把矩形选区按当前 DOM 文本重组成一张独立 markdown 表格（首行当表头 + 分隔行）。
  // 单格 / 无选区返回 null（让原生复制处理纯文本）。
  private buildSelectionMarkdown(table: HTMLTableElement): string | null {
    const rect = this.selectionRect();
    if (!rect || (rect.r1 === rect.r2 && rect.c1 === rect.c2)) return null;
    const rows = Array.from(table.querySelectorAll('tr'));
    const esc = (s: string) =>
      s.replace(/\u00a0/g, ' ').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
    const grid: string[][] = [];
    for (let r = rect.r1; r <= rect.r2; r++) {
      const cells = Array.from(rows[r]?.children ?? []) as HTMLElement[];
      const line: string[] = [];
      for (let c = rect.c1; c <= rect.c2; c++) {
        line.push(esc(cells[c]?.textContent ?? ''));
      }
      grid.push(line);
    }
    const cols = rect.c2 - rect.c1 + 1;
    const lineFor = (cells: string[]) =>
      '| ' + Array.from({ length: cols }, (_, i) => cells[i] || ' ').join(' | ') + ' |';
    const sep = '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |';
    return [lineFor(grid[0]), sep, ...grid.slice(1).map(lineFor)].join('\n');
  }
  // text/html：给外部富文本目标（Numbers / Word）保留真表格结构
  private buildSelectionHtml(table: HTMLTableElement): string | null {
    const rect = this.selectionRect();
    if (!rect || (rect.r1 === rect.r2 && rect.c1 === rect.c2)) return null;
    const rows = Array.from(table.querySelectorAll('tr'));
    const esc = (s: string) =>
      s
        .replace(/\u00a0/g, ' ')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .trim();
    let html = '<table>';
    for (let r = rect.r1; r <= rect.r2; r++) {
      const cells = Array.from(rows[r]?.children ?? []) as HTMLElement[];
      html += '<tr>';
      for (let c = rect.c1; c <= rect.c2; c++) {
        html += '<td>' + esc(cells[c]?.textContent ?? '') + '</td>';
      }
      html += '</tr>';
    }
    return html + '</table>';
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
    // 用户在 cell 里输入的内容只活在 DOM 里 —— 按钮 mousedown.preventDefault() 阻断了
    // focusout 同步路径，doc 里仍是输入前的旧 markdown。直接读 doc 会让 +列/+行 之类的
    // transform 把用户已输入但未同步的 cell 内容覆盖丢光。优先取 DOM 当前内容做 transform 源。
    const fromDom = this.markdownFromDOM(wrap);
    const current = fromDom ?? view.state.doc.sliceString(range.from, range.to);
    const next = transform(current);
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: next },
    });
  }
  // 删除整张表统一走 editor 层 contextmenu（tableContextMenu extension），widget 不再单挂
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
        // 多格选区下 Cmd/Ctrl+C：直接重组 markdown 写剪贴板（不依赖原生选区是否存在），
        // 空单元格 / 没选中文字也能复制。
        if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C') && this.isMultiSelection()) {
          e.preventDefault();
          const md = this.buildSelectionMarkdown(table);
          if (md) copyPlainText(md);
          return;
        }
        if (e.key === 'Escape' && this.isMultiSelection()) {
          e.preventDefault();
          this.clearSelection(table);
          return;
        }
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
        if (this.isMultiSelection()) this.clearSelection(table);
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

    // —— 鼠标拖拽选区（跨格）——
    // mousedown 不 preventDefault（让单格点击仍能落 caret 编辑）；mousemove 拖到另一格时
    // 接管：preventDefault + focus 目标格（焦点留在表内，wrap.focusout 的 guard 不会触发回写）
    // + 画矩形高亮。监听挂 table 的 capture 阶段——cell 自己的 mousedown 在 bubble 阶段
    // stopPropagation()，capture 先跑不受影响。
    let dragSelecting = false;
    table.addEventListener(
      'mousedown',
      e => {
        const cell = (e.target as HTMLElement).closest('th,td') as HTMLElement | null;
        if (!cell || !table.contains(cell)) return;
        const coord = this.cellCoord(table, cell);
        if (!coord) return;
        if (e.shiftKey && this.selAnchor) {
          e.preventDefault();
          this.selFocus = coord;
          this.applyHighlight(table);
          cell.focus();
          return;
        }
        this.selAnchor = coord;
        this.selFocus = coord;
        this.applyHighlight(table); // 单格 → 清掉旧的多格高亮
        dragSelecting = true;
      },
      true,
    );
    table.addEventListener(
      'mousemove',
      e => {
        if (!dragSelecting) return;
        const cell = (e.target as HTMLElement).closest('th,td') as HTMLElement | null;
        if (!cell || !table.contains(cell)) return;
        const coord = this.cellCoord(table, cell);
        if (!coord || !this.selAnchor) return;
        if (coord.r === this.selFocus?.r && coord.c === this.selFocus?.c) return;
        e.preventDefault();
        this.selFocus = coord;
        cell.focus();
        this.applyHighlight(table);
      },
      true,
    );
    const onMouseUp = () => {
      dragSelecting = false;
    };
    document.addEventListener('mouseup', onMouseUp);
    (wrap as unknown as { __cleanupRange?: () => void }).__cleanupRange = () =>
      document.removeEventListener('mouseup', onMouseUp);

    // 多格选区复制：Cmd+C（cell keydown 转发的 execCommand）+ 右键 Copy 都会派发 copy 事件，
    // 在 wrap 冒泡阶段拦下，先于 CM 在 contentDOM 上的 copy 处理器，覆写为重组的 markdown 表格。
    wrap.addEventListener('copy', e => {
      const md = this.buildSelectionMarkdown(table);
      if (!md) return; // 单格 / 无选区 → 放行原生复制
      e.preventDefault();
      e.stopPropagation();
      e.clipboardData?.setData('text/plain', md);
      e.clipboardData?.setData('text/html', this.buildSelectionHtml(table) ?? md);
    });

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
    // 删除整张表：放 +行/−行 同排水平左侧（CSS 定位）。叉号跟 +/− 统一风格，hover 变红
    mkBtn('cm-md-table-delete', '×', '删除整张表格', () => {
      const range = this.locate(view, wrap);
      if (range) deleteTableAtRange(view, range);
    });

    return wrap;
  }
  eq(other: TableWidget) {
    return this.source === other.source;
  }
  // widget DOM 被 CM 回收时，移除挂在 document 上的 mouseup 监听，避免泄漏
  destroy(dom: HTMLElement) {
    (dom as unknown as { __cleanupRange?: () => void }).__cleanupRange?.();
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
type LineItem = { pos: number; deco: Decoration };

interface DecorationCtx {
  state: EditorState;
  cursorLine: number;
  items: Item[];
  lineItems: LineItem[];
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

// ── lezer FencedCode 节点 ──
// 给代码块每一行加背景 line decoration + 等宽字体 mark。
//
// 注意：这里**不能**再用 Decoration.replace 去隐藏 ``` 围栏行。
// CM 铁律：line decoration 的位置不能落在某个 replace 区间覆盖的范围内。
// 之前给「每行（含围栏行）都加 line deco」+「对围栏行加跨换行符的 replace」会让
// 围栏行的 line deco 落进 replace 区间 → CM 视图更新时抛错 → 受控 value 每次
// re-render 重 dispatch → 抛错 → React 重渲染死循环（整个 app 卡死、正文存不进）。
// 围栏 ``` 各自独立成行本来就是 markdown 源码形态，直接显示即可，不必隐藏。
function handleFencedCode(node: SyntaxNodeRef, ctx: DecorationCtx) {
  // 整个代码块套等宽字体 mark
  ctx.items.push({
    from: node.from,
    to: node.to,
    deco: Decoration.mark({ class: 'cm-fenced-code' }),
  });

  // 给每一行（含围栏行 / 空行）加 line decoration 做背景
  const doc = ctx.state.doc;
  const startLine = doc.lineAt(node.from).number;
  const endLine = doc.lineAt(node.to).number;
  for (let i = startLine; i <= endLine; i++) {
    const line = doc.line(i);
    ctx.lineItems.push({
      pos: line.from,
      deco: codeBlockLineDeco,
    });
  }
}

const codeBlockLineDeco = Decoration.line({ class: 'cm-fenced-code-line' });
const blockquoteLineDeco = Decoration.line({ class: 'cm-blockquote-line' });

// ── lezer Blockquote 节点 ──
// 整段套 mark（文字颜色）+ 有内容的行加 line deco（左边框）+ 光标外隐藏 > 标记。
function handleBlockquote(node: SyntaxNodeRef, ctx: DecorationCtx) {
  const doc = ctx.state.doc;
  const cursorInside = isCursorOnNode(node, ctx);

  // 整段 mark（文字颜色）
  ctx.items.push({
    from: node.from,
    to: node.to,
    deco: Decoration.mark({ class: 'cm-blockquote' }),
  });

  // 只对有实际内容的行加 line decoration（跳过只含 > 的空引用行）
  const startLine = doc.lineAt(node.from).number;
  const endLine = doc.lineAt(node.to).number;
  for (let i = startLine; i <= endLine; i++) {
    const line = doc.line(i);
    const text = doc.sliceString(line.from, line.to);
    if (/^>\s*$/.test(text.trim())) continue;
    ctx.lineItems.push({ pos: line.from, deco: blockquoteLineDeco });
  }

  // 光标不在时隐藏 QuoteMark（> 字符 + 后续空格）
  if (!cursorInside) {
    const treeCursor = node.node.cursor();
    treeCursor.iterate(child => {
      if (child.name === 'QuoteMark') {
        let hideTo = child.to;
        const next = doc.sliceString(child.to, child.to + 1);
        if (next === ' ') hideTo += 1;
        ctx.items.push({
          from: child.from,
          to: hideTo,
          deco: Decoration.replace({}),
        });
      }
    });
  }
}

// ── lezer Image 节点 ──
// 光标在该 Image 节点的行上时，显示原 markdown 让用户编辑；
// 否则用 widget 把 ![alt](src) 整段替换为 <img>。
// 返回 true 表示跳过子节点（避免 URL / LinkMark 子节点被另规则隐藏，造成 widget 范围错乱）。
function handleImage(node: SyntaxNodeRef, ctx: DecorationCtx): boolean {
  if (isCursorOnNode(node, ctx)) return false;

  const text = ctx.state.doc.sliceString(node.from, node.to);
  const m = text.match(/^!\[([^\]|]*)(?:\|(\d+))?\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
  if (!m) return false;

  const [, alt, widthStr, src] = m;
  const width = widthStr ? parseInt(widthStr, 10) : null;
  ctx.items.push({
    from: node.from,
    to: node.to,
    deco: Decoration.replace({ widget: new ImageWidget(src, alt, width, node.from, node.to) }),
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

const hrLineDeco = Decoration.line({ class: 'cm-md-hr' });
const hrLineActiveDeco = Decoration.line({ class: 'cm-md-hr-active' });
const listLineDeco = Decoration.line({ class: 'cm-list-line' });

function handleHorizontalRule(node: SyntaxNodeRef, ctx: DecorationCtx) {
  const line = ctx.state.doc.lineAt(node.from);
  const selectionTouchesLine = ctx.state.selection.ranges.some(range =>
    range.from <= line.to && range.to >= line.from
  );
  if (selectionTouchesLine) {
    ctx.lineItems.push({ pos: line.from, deco: hrLineActiveDeco });
    return;
  }
  ctx.lineItems.push({ pos: line.from, deco: hrLineDeco });
  if (line.to > line.from) {
    ctx.items.push({ from: line.from, to: line.to, deco: Decoration.replace({}) });
  }
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

  // 数嵌套深度（两分支共用）
  let depth = 0;
  let cur = node.node.parent;
  while (cur) {
    if (cur.name === 'BulletList' || cur.name === 'OrderedList') {
      depth++;
    }
    cur = cur.parent;
  }

  if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(lineText)) {
    // 任务项 → 隐藏 "- " 前缀
    const next = ctx.state.doc.sliceString(node.to, node.to + 1);
    const hideTo = next === ' ' ? node.to + 1 : node.to;
    ctx.items.push({
      from: node.from,
      to: hideTo,
      deco: Decoration.replace({}),
    });
  } else {
    // 普通列表
    ctx.items.push({
      from: node.from,
      to: node.to,
      deco: depth >= 2 ? hollowBulletDeco : bulletDeco,
    });
  }

  ctx.lineItems.push({ pos: line.from, deco: listLineDeco });
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

const PATCH_WINDOW_CHARS = 24000;

function patchWindow(ctx: DecorationCtx) {
  const doc = ctx.state.doc;
  if (doc.length <= PATCH_WINDOW_CHARS) {
    return {
      from: 0,
      to: doc.length,
      text: doc.toString(),
      startLine: 1,
      endLine: doc.lines,
    };
  }

  const half = Math.floor(PATCH_WINDOW_CHARS / 2);
  const head = ctx.state.selection.main.head;
  const start = doc.lineAt(Math.max(0, head - half)).from;
  const end = doc.lineAt(Math.min(doc.length, head + half)).to;
  return {
    from: start,
    to: end,
    text: doc.sliceString(start, end),
    startLine: doc.lineAt(start).number,
    endLine: doc.lineAt(end).number,
  };
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
  const win = patchWindow(ctx);
  if (!win.text.includes('*')) return;
  const isInLezerRange = (from: number, to: number) =>
    ctx.lezerEmphasisRanges.some(([f, t]) => from >= f && to <= t);

  // 先扫 ** ** （strong），再扫 * *（em）—— 顺序很重要，避免 ** 内层 * 误识别
  const strongRe = /\*\*([^*\n]+?)\*\*/g;
  let sm: RegExpExecArray | null;
  while ((sm = strongRe.exec(win.text)) !== null) {
    const mFrom = win.from + sm.index;
    const mTo = mFrom + sm[0].length;
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
  while ((em = emRe.exec(win.text)) !== null) {
    const mFrom = win.from + em.index;
    const mTo = mFrom + em[0].length;
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
  const win = patchWindow(ctx);
  for (let lineNum = win.startLine; lineNum <= win.endLine; lineNum++) {
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
  const focused = state.facet(editorFocused);
  const ctx: DecorationCtx = {
    state,
    cursorLine: focused ? state.doc.lineAt(state.selection.main.head).number : -1,
    items: [],
    lineItems: [],
    lezerEmphasisRanges: [],
    lezerListMarkPositions: new Set(),
  };

  // StateField 不能访问 visibleRanges；这里依赖 CodeMirror 的增量语法树，不主动 force parse
  // 到文档末尾。长笔记若每键强制解析全文，会造成持续高 CPU / 高耗电。
  // enter 函数本身只做 dispatch，每类节点由 handleXXX helper 处理；返回 false 跳过子节点。
  syntaxTree(state).iterate({
    enter(node) {
      const name = node.name;

      // 整段节点 mark / heading / link
      if (
        name === 'StrongEmphasis' ||
        name === 'Emphasis' ||
        name === 'Strikethrough' ||
        name === 'InlineCode' ||
        name === 'Link' ||
        name === 'Autolink' ||
        /^ATXHeading[1-6]$/.test(name)
      ) {
        handleEntireNodeStyle(node, ctx);
        return;
      }

      // Blockquote：独立 handler（line deco + 隐藏 > 标记）
      if (name === 'Blockquote') {
        handleBlockquote(node, ctx);
        return false;
      }

      // 复合节点（widget + 跳过 children）
      if (name === 'Image') {
        if (handleImage(node, ctx)) return false;
        return;
      }
      if (name === 'FencedCode') {
        handleFencedCode(node, ctx);
        return false;
      }
      if (name === 'Table') {
        if (handleTable(node, ctx)) return false;
        return;
      }
      if (name === 'HorizontalRule') {
        handleHorizontalRule(node, ctx);
        return false;
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
  const ranges = ctx.items.map(it => it.deco.range(it.from, it.to));
  const lineRanges = ctx.lineItems.map(it => it.deco.range(it.pos, it.pos));
  return Decoration.set([...ranges, ...lineRanges], true);
}

const editorFocused = Facet.define<boolean, boolean>({
  combine: values => values.length > 0 ? values[0] : true,
});

const focusTracker = StateField.define<boolean>({
  create() { return false; },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(focusEffect)) return e.value;
    }
    return value;
  },
  provide: f => editorFocused.from(f),
});

export const focusEffect = StateEffect.define<boolean>();

const focusListener = EditorView.focusChangeEffect.of((_, focused) => focusEffect.of(focused));

function selectionNeedsDecorationRebuild(tr: Transaction): boolean {
  if (!tr.selection) return false;
  const prev = tr.startState.selection.main;
  const next = tr.state.selection.main;
  const prevLine = tr.startState.doc.lineAt(prev.head).number;
  const nextLine = tr.state.doc.lineAt(next.head).number;
  return prevLine !== nextLine || prev.empty !== next.empty;
}

export const livePreview = [
  focusTracker,
  focusListener,
  StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state);
    },
    update(deco, tr) {
      if (tr.docChanged || selectionNeedsDecorationRebuild(tr)
        || tr.effects.some(e => e.is(focusEffect))) {
        return buildDecorations(tr.state);
      }
      return deco;
    },
    provide: f => EditorView.decorations.from(f),
  }),
];
