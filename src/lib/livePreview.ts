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
type PendingTableDelete = TableRange | null;
const pendingTableDeleteEffect = StateEffect.define<PendingTableDelete>();

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

  const prevLine = line.number > 1 ? doc.line(line.number - 1) : null;
  if (prevLine?.text.length === 0 && line.number > 2) {
    const beforeBlank = tableRangeFromLine(doc, line.number - 2);
    if (beforeBlank) return beforeBlank;
  }
  return prevLine ? tableRangeFromLine(doc, prevLine.number) : null;
}

function tableRangeForExactSelection(doc: Text, from: number, to: number): TableRange | null {
  const range = tableRangeBetween(doc, from, to, true);
  if (!range) return null;
  if (from !== range.from) return null;
  if (to !== range.to && to !== range.widgetTo) return null;
  return range;
}

function selectionCoversTableRange(state: EditorState, range: TableRange): boolean {
  return state.selection.ranges.some(sel =>
    !sel.empty && sel.from <= range.from && sel.to >= range.to
  );
}

function pendingDeleteCoversTable(state: EditorState, range: TableRange): boolean {
  const pending = state.field(pendingTableDeleteField, false);
  return !!pending && pending.from === range.from && pending.to === range.to;
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
  const editTarget = cell.querySelector('.cm-md-table-cell-content') as HTMLElement | null;
  (editTarget ?? cell).focus();
  collapseCellSelection(editTarget ?? cell, edge === 'last');
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
  const x = forward && coords ? (coords.left + coords.right) / 2 : null;
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

type TableModel = {
  header: string[];
  aligns: Align[];
  body: string[][];
};

function tableModelFromMarkdown(src: string): TableModel | null {
  const lines = src
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && l.includes('|'));
  if (lines.length < 2) return null;

  const header = parseTableRow(lines[0]);
  if (header.length === 0) return null;
  const aligns = parseAlignments(lines[1]);
  const body = lines.slice(2).map(parseTableRow);
  return { header, aligns, body };
}

function escapeTableCell(cell: string): string {
  return cell.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

function serializeTableModel(model: TableModel): string {
  const cols = Math.max(1, model.header.length);
  const alignFor = (align: Align | undefined) => {
    if (align === 'center') return ':---:';
    if (align === 'left') return ':---';
    if (align === 'right') return '---:';
    return '---';
  };
  const lineFor = (cells: string[]) =>
    '| ' + Array.from({ length: cols }, (_, i) => escapeTableCell(cells[i] ?? '') || ' ').join(' | ') + ' |';

  return [
    lineFor(model.header),
    '| ' + Array.from({ length: cols }, (_, i) => alignFor(model.aligns[i])).join(' | ') + ' |',
    ...model.body.map(lineFor),
  ].join('\n');
}

function insertColumnAfter(src: string, colIdx: number): string {
  const model = tableModelFromMarkdown(src);
  if (!model) return src;
  const idx = Math.max(0, Math.min(colIdx, model.header.length - 1));
  model.header.splice(idx + 1, 0, '');
  model.aligns.splice(idx + 1, 0, null);
  model.body.forEach(row => row.splice(idx + 1, 0, ''));
  return serializeTableModel(model);
}

function removeColumnAt(src: string, colIdx: number): string {
  const model = tableModelFromMarkdown(src);
  if (!model || model.header.length <= 1) return src;
  const idx = Math.max(0, Math.min(colIdx, model.header.length - 1));
  model.header.splice(idx, 1);
  model.aligns.splice(idx, 1);
  model.body.forEach(row => row.splice(idx, 1));
  return serializeTableModel(model);
}

function insertRowAfter(src: string, rowIdx: number): string {
  const model = tableModelFromMarkdown(src);
  if (!model) return src;
  const cols = model.header.length;
  const bodyInsertIdx = Math.max(0, Math.min(rowIdx, model.body.length));
  model.body.splice(bodyInsertIdx, 0, Array.from({ length: cols }, () => ''));
  return serializeTableModel(model);
}

function removeRowAt(src: string, rowIdx: number): string {
  const model = tableModelFromMarkdown(src);
  if (!model || rowIdx <= 0) return src;
  const bodyIdx = rowIdx - 1;
  if (bodyIdx < 0 || bodyIdx >= model.body.length) return src;
  model.body.splice(bodyIdx, 1);
  return serializeTableModel(model);
}

function moveColumnBy(src: string, colIdx: number, dir: -1 | 1): string {
  const model = tableModelFromMarkdown(src);
  if (!model) return src;
  const targetIdx = colIdx + dir;
  if (targetIdx < 0 || targetIdx >= model.header.length) return src;
  [model.header[colIdx], model.header[targetIdx]] = [model.header[targetIdx], model.header[colIdx]];
  [model.aligns[colIdx], model.aligns[targetIdx]] = [model.aligns[targetIdx], model.aligns[colIdx]];
  model.body.forEach(row => {
    [row[colIdx], row[targetIdx]] = [row[targetIdx], row[colIdx]];
  });
  return serializeTableModel(model);
}

function moveRowBy(src: string, rowIdx: number, dir: -1 | 1): string {
  const model = tableModelFromMarkdown(src);
  if (!model || rowIdx <= 0) return src;
  const bodyIdx = rowIdx - 1;
  const targetBodyIdx = bodyIdx + dir;
  if (targetBodyIdx < 0 || targetBodyIdx >= model.body.length) return src;
  [model.body[bodyIdx], model.body[targetBodyIdx]] = [model.body[targetBodyIdx], model.body[bodyIdx]];
  return serializeTableModel(model);
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
  const suffix = '\n\n';
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

// Backspace 在表格下方空行时：第一次选中整张表，第二次才删除。
export function deleteTableBackward(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  const pending = state.field(pendingTableDeleteField, false);

  if (!sel.empty) {
    const selectedTable =
      pending && pending.from === sel.from && (pending.to === sel.to || pending.widgetTo === sel.to)
        ? pending
        : tableRangeForExactSelection(state.doc, sel.from, sel.to);
    if (!selectedTable) return false;
    deleteTableAtRange(view, selectedTable);
    return true;
  }

  const line = state.doc.lineAt(sel.head);
  const lineText = state.doc.sliceString(line.from, line.to);
  if (lineText.length !== 0) return false;
  if (line.number <= 1) return false;

  const prevLine = state.doc.line(line.number - 1);
  const range = tableRangeFromLine(state.doc, prevLine.number);
  if (!range) return false;

  view.dispatch({
    selection: { anchor: range.from, head: range.widgetTo },
    effects: pendingTableDeleteEffect.of(range),
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

// 给外部使用：把当前行（或选中的多行）切换为/取消待办
// 已是任务项（无论 [ ] 或 [x]）→ 移除 checkbox 前缀变回纯文本
// 纯文本/无序列表 → 加上 - [ ] 前缀
export type TaskToggleRange = { from: number; to: number };
type TaskToggleChange = { from: number; to: number; insert: string; selectionAnchor?: number };

export function getTaskToggleChanges(doc: Text, range: TaskToggleRange): TaskToggleChange[] {
  const startLine = doc.lineAt(range.from);
  const endLine = doc.lineAt(range.to);
  const changes: TaskToggleChange[] = [];

  for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
    const line = doc.line(lineNum);
    const text = line.text;

    // 兜底修复旧的错位产物：纯文本后面被追加了 "- [ ] " 时，归一化为行首任务项。
    const misplacedTask = text.match(/^(\s*)(.+?)([-*+]\s+\[[ xX]\]\s*)$/);
    if (misplacedTask && !/^\s*[-*+]\s+\[[ xX]\]\s/.test(text)) {
      const [, indent, body, marker] = misplacedTask;
      const insert = `${indent}${marker.trimEnd()} ${body.trimEnd()}`;
      changes.push({
        from: line.from,
        to: line.to,
        insert,
        selectionAnchor: line.from + insert.length,
      });
      continue;
    }

    // 已是任务项 → 移除 checkbox 前缀，变回纯文本
    const m = text.match(/^(\s*)([-*+])\s+\[([ xX])\]\s/);
    if (m) {
      const [full, indent] = m;
      changes.push({
        from: line.from,
        to: line.from + full.length,
        insert: indent,
        selectionAnchor: line.from + indent.length,
      });
      continue;
    }

    // 普通无序列表 → 升级为任务项
    const listMatch = text.match(/^(\s*)([-*+])\s+/);
    if (listMatch) {
      const [full, indent, bullet] = listMatch;
      const next = `${indent}${bullet} [ ] `;
      const body = text.slice(full.length);
      changes.push({
        from: line.from,
        to: line.from + full.length,
        insert: next,
        selectionAnchor: line.from + next.length + body.length,
      });
      continue;
    }

    // 纯文本或空行 → 行首插入 "- [ ] "
    const indentMatch = text.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    const body = text.slice(indent.length);
    const insert = `${indent}- [ ] ${body}`;
    changes.push({
      from: line.from,
      to: line.to,
      insert,
      selectionAnchor: line.from + insert.length,
    });
  }

  return changes;
}

export function toggleTask(view: EditorView, range?: TaskToggleRange) {
  const { state } = view;
  const selectedRange = range ?? state.selection.main;
  const changes = getTaskToggleChanges(state.doc, selectedRange);

  if (changes.length) {
    const anchor = changes.length === 1 ? changes[0].selectionAnchor : undefined;
    const selection = typeof anchor === 'number' ? { anchor } : undefined;
    view.dispatch({ changes, selection, scrollIntoView: Boolean(selection) });
  }
  view.focus();
}

// —— 图片光标删除 ——
// 光标退到图片右边界时整段删除 ![alt|width](src)，而不是走 CM 默认 deleteCharBackward 逐字符啃。
// 与 handleImage 用同一套图片正则（去掉 ^ 锚点 + 全局），保证「能删的范围」= 「渲染成 widget 的范围」。
function imageStartEndingAt(lineText: string, endOffset: number): number | null {
  const re = /!\[[^\]|]*(?:\|\d+)?\]\([^)\s]+(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineText)) !== null) {
    if (m.index + m[0].length === endOffset) return m.index;
  }
  return null;
}

// 空选区光标在 pos，返回应整段删除的图片 range；无图片边界则返回 null（交回默认删除）。
export function getImageDeleteBackwardRange(doc: Text, pos: number): { from: number; to: number } | null {
  const line = doc.lineAt(pos);
  const offsetInLine = pos - line.from;

  // 同行：光标紧贴某张图片右侧
  if (offsetInLine > 0) {
    const start = imageStartEndingAt(line.text, offsetInLine);
    if (start !== null) return { from: line.from + start, to: pos };
  }

  // 下一行行首：上一行以图片结尾 → 删图片 + 中间换行（从图片正下方按一次 Backspace 整张消失）
  if (offsetInLine === 0 && line.number > 1) {
    const prev = doc.line(line.number - 1);
    const start = imageStartEndingAt(prev.text, prev.text.length);
    if (start !== null) return { from: prev.from + start, to: pos };
  }

  return null;
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
  selected: boolean;
  // 矩形选区：anchor=按下的格，focus=拖到的格。每个 cell 是独立 contentEditable，浏览器
  // 原生 selection 无法跨多个 editing host，所以多格选区完全自己维护（CSS class 高亮 +
  // 复制时按矩形重组 markdown）。单格（anchor==focus）不算多选，走原生编辑。
  private selAnchor: CellCoord | null = null;
  private selFocus: CellCoord | null = null;
  constructor(source: string, selected = false) {
    super();
    this.source = source;
    this.selected = selected;
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
        const clone = cells[c]?.cloneNode(true) as HTMLElement | undefined;
        if (clone) clone.querySelectorAll('.cm-md-table-col-controls, .cm-md-table-row-controls').forEach(n => n.remove());
        line.push(esc(clone?.textContent ?? ''));
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
        const cl = cells[c]?.cloneNode(true) as HTMLElement | undefined;
        if (cl) cl.querySelectorAll('.cm-md-table-col-controls, .cm-md-table-row-controls').forEach(n => n.remove());
        html += '<td>' + esc(cl?.textContent ?? '') + '</td>';
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
  private rewriteFromDOM(view: EditorView, wrap: HTMLElement, transform: (src: string) => string) {
    const range = this.locate(view, wrap);
    if (!range) return;
    const current = this.markdownFromDOM(wrap) ?? view.state.doc.sliceString(range.from, range.to);
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
    const cellsOf = (root: ParentNode, sel: string) =>
      Array.from(root.querySelectorAll(sel)).map(el => {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('.cm-md-table-col-controls, .cm-md-table-row-controls').forEach(n => n.remove());
        return escapeTableCell(clone.textContent ?? '');
      });
    const headerCells = cellsOf(tbl, 'thead th');
    const bodyRows = Array.from(tbl.querySelectorAll('tbody tr')).map(tr =>
      cellsOf(tr, 'td')
    );
    return serializeTableModel({ header: headerCells, aligns, body: bodyRows });
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

    const afterAnchor = () => {
      const base = range.from + next.length + (range.widgetTo > range.to ? 1 : 0);
      if (range.widgetTo >= view.state.doc.length) return base;

      const lineAfterTable = view.state.doc.lineAt(range.widgetTo);
      const shouldSkipAuxBlank =
        lineAfterTable.from === range.widgetTo &&
        lineAfterTable.text.length === 0 &&
        lineAfterTable.to < view.state.doc.length;
      return base + (shouldSkipAuxBlank ? 1 : 0);
    };

    const selection =
      selectionSide === 'before'
        // 往上离开表格：锚到表格块起点的「前一个位置」（= 上一行行尾），而不是 range.from。
        // range.from 是 block widget 的起点，CM 会把该偏移关联到 widget「之后」→ 光标反而落到
        // 表格下方那一行（用户：表头再往上先跳到表下方）。range.from-1 在 widget 之外、无歧义在上方。
        ? { anchor: Math.max(0, range.from - 1) }
        : selectionSide === 'after'
          ? { anchor: afterAnchor() }
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
    wrap.classList.toggle('cm-md-table-selected', this.selected);
    // wrap 自身不可编辑，让 CodeMirror 不把它当文档内容；但子元素 cells 可以单独 contentEditable
    wrap.contentEditable = 'false';

    const model = tableModelFromMarkdown(this.source);
    if (!model) {
      wrap.textContent = this.source;
      return wrap;
    }

    const { header, aligns, body } = model;

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
      const targetEdit = target.querySelector('.cm-md-table-cell-content') as HTMLElement | null;
      (targetEdit ?? target).focus();
      collapseCellSelection(targetEdit ?? target, placeAtEnd);
    };

    // cell 渲染：空文本用 &nbsp; 撑住高度，contentEditable 让用户直接键入
    const fillCell = (el: HTMLElement, text: string) => {
      // 编辑区放在子 span 里，避免 controls（contentEditable=false）干扰输入
      const editSpan = document.createElement('span');
      editSpan.className = 'cm-md-table-cell-content';
      editSpan.contentEditable = 'true';
      editSpan.spellcheck = false;
      editSpan.style.display = 'block';
      editSpan.style.outline = 'none';
      if (text.length === 0) {
        editSpan.innerHTML = '&nbsp;';
      } else {
        editSpan.textContent = text;
      }
      el.appendChild(editSpan);
      // 进入 cell 时清掉占位 nbsp
      editSpan.addEventListener('focus', () => {
        if (editSpan.textContent === '\u00a0') {
          editSpan.textContent = '';
          view.requestMeasure();
        }
      });
      editSpan.addEventListener('blur', () => {
        if ((editSpan.textContent ?? '').length === 0) {
          editSpan.innerHTML = '&nbsp;';
          view.requestMeasure();
        }
      });
      // 方向键 / Tab / Enter 在 cells 间跳转
      editSpan.addEventListener('keydown', e => {
        e.stopPropagation();
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
          const len = (editSpan.textContent ?? '').length;
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
      editSpan.addEventListener('mousedown', e => e.stopPropagation());
      editSpan.addEventListener('input', e => {
        e.stopPropagation();
        if (this.isMultiSelection()) this.clearSelection(table);
        view.requestMeasure();
      });
    };

    const mkCellBtn = (cls: string, label: string, title: string, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.title = title;
      b.textContent = label;
      b.contentEditable = 'false';
      b.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
      return b;
    };

    const rowControls: Array<{ cell: HTMLElement; ctrl: HTMLElement }> = [];
    // 表格内有 cell 处于编辑（focus）态时为 true：编辑时不弹行控制——用户在打字，左侧冒按钮是干扰。
    let editingCell = false;
    const hideAllRowControls = () =>
      rowControls.forEach(({ ctrl }) => ctrl.classList.remove('cm-md-table-row-controls-visible'));
    const bindRowControl = (cell: HTMLElement, ctrl: HTMLElement) => {
      rowControls.push({ cell, ctrl });
      // 显示某行时先清掉其它行 → 同时只亮一行。行控制竖排比单行高，不清的话连续跨行 hover 会多行糊在一起。
      const show = () => {
        if (editingCell) return;
        rowControls.forEach(({ ctrl: other }) => {
          if (other !== ctrl) other.classList.remove('cm-md-table-row-controls-visible');
        });
        ctrl.classList.add('cm-md-table-row-controls-visible');
      };
      // 离开即快速消失（40ms 仅给 cell↔按钮 之间 ~2px 间隙留极短穿越余量）。不挂 focus 事件：编辑不触发显示。
      const hide = () => {
        window.setTimeout(() => {
          if (!cell.matches(':hover') && !ctrl.matches(':hover')) {
            ctrl.classList.remove('cm-md-table-row-controls-visible');
          }
        }, 40);
      };
      cell.addEventListener('mouseenter', show);
      cell.addEventListener('mouseleave', hide);
      ctrl.addEventListener('mouseenter', show);
      ctrl.addEventListener('mouseleave', hide);
    };
    // 编辑态开关：任意 cell 获得焦点 → 隐藏全部行控制并锁住 hover 显示；焦点离开整张表 → 解锁。
    // focusin/focusout 会从 cell 内的 contentEditable span 冒泡到 table，故挂在 table 上做委托。
    table.addEventListener('focusin', () => {
      editingCell = true;
      hideAllRowControls();
    });
    table.addEventListener('focusout', e => {
      if (!table.contains(e.relatedTarget as Node | null)) editingCell = false;
    });

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    header.forEach((cell, i) => {
      const th = document.createElement('th');
      fillCell(th, cell);
      th.dataset.colIndex = String(i);
      const a = aligns[i];
      if (a) th.style.textAlign = a;
      // 每列控制：←/→ 移列、+/−，CSS 定位到 cell 上方外部
      const colCtrl = document.createElement('span');
      colCtrl.className = 'cm-md-table-col-controls';
      colCtrl.contentEditable = 'false';
      colCtrl.appendChild(mkCellBtn('cm-md-table-cell-move', '←', '左移列', () =>
        this.rewriteFromDOM(view, wrap, src => moveColumnBy(src, i, -1))
      ));
      colCtrl.appendChild(mkCellBtn('cm-md-table-cell-move', '→', '右移列', () =>
        this.rewriteFromDOM(view, wrap, src => moveColumnBy(src, i, 1))
      ));
      colCtrl.appendChild(mkCellBtn('cm-md-table-cell-add', '+', '在右侧插入列', () =>
        this.rewriteFromDOM(view, wrap, src => insertColumnAfter(src, i))
      ));
      colCtrl.appendChild(mkCellBtn('cm-md-table-cell-remove', '−', '删除这一列', () =>
        this.rewriteFromDOM(view, wrap, src => removeColumnAt(src, i))
      ));
      // header 第一列也挂行控制（用于在 header 下方插入行）
      if (i === 0) {
        const rowCtrl = document.createElement('span');
        rowCtrl.className = 'cm-md-table-row-controls';
        rowCtrl.contentEditable = 'false';
        rowCtrl.appendChild(mkCellBtn('cm-md-table-cell-add', '+', '在下方插入行', () =>
          this.rewriteFromDOM(view, wrap, src => insertRowAfter(src, 0))
        ));
        bindRowControl(th, rowCtrl);
      }
      th.appendChild(colCtrl);
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    body.forEach((row, bodyIdx) => {
      const tr = document.createElement('tr');
      tr.dataset.rowIndex = String(bodyIdx + 1);
      for (let i = 0; i < header.length; i++) {
        const td = document.createElement('td');
        fillCell(td, row[i] ?? '');
        td.dataset.colIndex = String(i);
        const a = aligns[i];
        if (a) td.style.textAlign = a;
        // 每行控制：↑/↓ 移行、+/−，挂在第一列 td 上，CSS 定位到 cell 左侧外部，竖向排列
        if (i === 0) {
          const rowIdx = bodyIdx + 1;
          const rowCtrl = document.createElement('span');
          rowCtrl.className = 'cm-md-table-row-controls';
          rowCtrl.contentEditable = 'false';
          rowCtrl.appendChild(mkCellBtn('cm-md-table-cell-move', '↑', '上移行', () =>
            this.rewriteFromDOM(view, wrap, src => moveRowBy(src, rowIdx, -1))
          ));
          rowCtrl.appendChild(mkCellBtn('cm-md-table-cell-move', '↓', '下移行', () =>
            this.rewriteFromDOM(view, wrap, src => moveRowBy(src, rowIdx, 1))
          ));
          rowCtrl.appendChild(mkCellBtn('cm-md-table-cell-add', '+', '在下方插入行', () =>
            this.rewriteFromDOM(view, wrap, src => insertRowAfter(src, rowIdx))
          ));
          rowCtrl.appendChild(mkCellBtn('cm-md-table-cell-remove', '−', '删除这一行', () =>
            this.rewriteFromDOM(view, wrap, src => removeRowAt(src, rowIdx))
          ));
          bindRowControl(td, rowCtrl);
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    const scroll = document.createElement('div');
    scroll.className = 'cm-md-table-scroll';
    scroll.appendChild(table);
    wrap.appendChild(scroll);

    // 行控制（↑↓+−）必须落在表格左侧的外边距里，但表格要保持「居左」紧贴正文左边缘。
    // 难点：编辑器 .cm-content / .cm-scroller / .cm-editor / .live-md-editor 都强制
    // overflow-x:hidden（让正文换行、不出现横向滚动条），裁剪线正好在内容左边缘。任何摆在
    // 表格左侧（负 left）的元素都会被裁掉、整排消失——这正是「加横向滚动后左侧按钮没了」的根因。
    // 解法：把行控制挂到编辑器外层的 .cursor-text 容器（它在所有 overflow:hidden 之上、自身
    // overflow:visible，且有 pl-10 左留白），用绝对定位摆进左留白槽。表格不动 → 仍居左；
    // 按钮在裁剪线之外的留白里 → 不被裁。位置用 JS 实测（getBoundingClientRect）摆。
    const gutter = (view.dom.closest('.cursor-text') as HTMLElement | null) ?? wrap;
    rowControls.forEach(({ ctrl }) => gutter.appendChild(ctrl));

    const positionRowControls = () => {
      const gutterRect = gutter.getBoundingClientRect();
      // 横向锚点用 wrap（表格容器，永远贴正文左边缘、不随表格内部横向滚动移动）→ 按钮钉在左外边距；
      // 纵向锚点用各行 cell 的实测 top → 对齐到对应行的竖直中心。
      const wrapRect = wrap.getBoundingClientRect();
      rowControls.forEach(({ cell, ctrl }) => {
        const cellRect = cell.getBoundingClientRect();
        ctrl.style.left = `${wrapRect.left - gutterRect.left - 28}px`;
        ctrl.style.top = `${cellRect.top - gutterRect.top + cellRect.height / 2}px`;
      });
    };
    requestAnimationFrame(positionRowControls);
    // 表格内部横向滚动 + 笔记纵向滚动（在 .cm-scroller 内）都要重新摆；编辑器宽度变化
    // （侧栏开合 / 窗口缩放 / 字体加载）不触发 widget 重建，靠 ResizeObserver 兜住。
    scroll.addEventListener('scroll', positionRowControls);
    view.scrollDOM.addEventListener('scroll', positionRowControls);
    const resizeObserver = new ResizeObserver(() => positionRowControls());
    resizeObserver.observe(wrap);

    const nearestCellAtPoint = (x: number, y: number): HTMLElement | null => {
      const cells = Array.from(table.querySelectorAll<HTMLElement>('th,td'));
      let best: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const cell of cells) {
        const rect = cell.getBoundingClientRect();
        const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
        const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          best = cell;
        }
      }
      return best;
    };

    // —— 鼠标拖拽选区（跨格）——
    // 真实编辑区的点击放给 contentEditable 自己处理；表格边线 / cell 空白区域点击则接管，
    // 聚焦最近 cell，避免 CodeMirror 把 block widget 点击解释成“表格前一行”的光标位置。
    let dragSelecting = false;
    table.addEventListener(
      'mousedown',
      e => {
        const target = e.target as HTMLElement;
        if (target.closest('.cm-md-table-col-controls, .cm-md-table-row-controls')) {
          return;
        }
        const clickedEdit = target.closest('.cm-md-table-cell-content');
        const cell =
          (target.closest('th,td') as HTMLElement | null) ??
          nearestCellAtPoint(e.clientX, e.clientY);
        if (!cell || !table.contains(cell)) return;
        const coord = this.cellCoord(table, cell);
        if (!coord) return;

        if (!clickedEdit) {
          e.preventDefault();
          e.stopPropagation();
          const edit = cell.querySelector('.cm-md-table-cell-content') as HTMLElement | null;
          (edit ?? cell).focus();
          collapseCellSelection(edit ?? cell, false);
        }

        if (e.shiftKey && this.selAnchor) {
          e.preventDefault();
          this.selFocus = coord;
          this.applyHighlight(table);
          (cell.querySelector('.cm-md-table-cell-content') as HTMLElement | null ?? cell).focus();
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
        (cell.querySelector('.cm-md-table-cell-content') as HTMLElement | null ?? cell).focus();
        this.applyHighlight(table);
      },
      true,
    );
    const onMouseUp = () => {
      dragSelecting = false;
    };
    document.addEventListener('mouseup', onMouseUp);
    (wrap as unknown as { __cleanupRange?: () => void }).__cleanupRange = () => {
      document.removeEventListener('mouseup', onMouseUp);
      scroll.removeEventListener('scroll', positionRowControls);
      view.scrollDOM.removeEventListener('scroll', positionRowControls);
      resizeObserver.disconnect();
      // 行控制挂在 gutter（widget DOM 之外），CM 回收 widget 不会顺带删它们 → 手动移除，防泄漏
      rowControls.forEach(({ ctrl }) => ctrl.remove());
    };

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

    return wrap;
  }
  eq(other: TableWidget) {
    return this.source === other.source && this.selected === other.selected;
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
  const selected = pendingDeleteCoversTable(ctx.state, range) || selectionCoversTableRange(ctx.state, range);
  ctx.items.push({
    from: range.from,
    to: range.widgetTo,
    deco: Decoration.replace({
      widget: new TableWidget(text, selected),
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

const pendingTableDeleteField = StateField.define<PendingTableDelete>({
  create() { return null; },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(pendingTableDeleteEffect)) return e.value;
    }
    if (!value) return null;
    if (tr.docChanged) return null;
    if (tr.selection) {
      const sel = tr.state.selection.main;
      const stillSelected =
        !sel.empty &&
        sel.from === value.from &&
        (sel.to === value.to || sel.to === value.widgetTo);
      return stillSelected ? value : null;
    }
    return value;
  },
});

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
  pendingTableDeleteField,
  focusListener,
  StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state);
    },
    update(deco, tr) {
      if (tr.docChanged || selectionNeedsDecorationRebuild(tr)
        || tr.effects.some(e => e.is(focusEffect) || e.is(pendingTableDeleteEffect))) {
        return buildDecorations(tr.state);
      }
      return deco;
    },
    provide: f => EditorView.decorations.from(f),
  }),
];
