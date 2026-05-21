import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { RangeSetBuilder, StateField, type EditorState } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
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
  private locate(view: EditorView, wrap: HTMLElement): { from: number; to: number } | null {
    const pos = view.posAtDOM(wrap);
    const startLine = view.state.doc.lineAt(pos);
    const from = startLine.from;
    let endLineNum = startLine.number;
    const total = view.state.doc.lines;
    while (
      endLineNum < total &&
      view.state.doc.line(endLineNum + 1).text.includes('|')
    ) {
      endLineNum++;
    }
    const endLine = view.state.doc.line(endLineNum);
    return { from, to: endLine.to };
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
  // 把 widget DOM 里 cells 的内容回写到 markdown（焦点离开整张表才调一次）
  private syncToMarkdown(view: EditorView, wrap: HTMLElement) {
    const tbl = wrap.querySelector('table.cm-md-table') as HTMLTableElement | null;
    if (!tbl) return;
    const range = this.locate(view, wrap);
    if (!range) return;
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
    const next = lines.join('\n');
    if (next === this.source) return;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: next },
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
      if (!target) return;
      target.focus();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(!placeAtEnd);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
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
        if (el.textContent === ' ') el.textContent = '';
      });
      el.addEventListener('blur', () => {
        if ((el.textContent ?? '').length === 0) el.innerHTML = '&nbsp;';
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
      el.addEventListener('input', e => e.stopPropagation());
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

function buildDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;

  // 强制解析到文档尾，避免初次切换笔记时 syntax tree 还没含 Table / TaskMarker 节点 → 装饰漏建
  ensureSyntaxTree(state, state.doc.length, 50);

  // 收集所有要应用的装饰，按 from 升序排，方便交给 builder
  type Item = { from: number; to: number; deco: Decoration };
  const items: Item[] = [];

  // StateField 不能限制为 visibleRanges（无法访问 view）；笔记体量小，整文档遍历可接受
  syntaxTree(state).iterate({
    enter(node) {
        const nodeFromLine = state.doc.lineAt(node.from).number;
        const nodeToLine = state.doc.lineAt(node.to).number;
        const cursorOnNode =
          cursorLine >= nodeFromLine && cursorLine <= nodeToLine;
        const name = node.name;

        // 整段节点：套样式（mark），不依赖光标
        if (name === 'StrongEmphasis') {
          items.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-strong' }),
          });
        } else if (name === 'Emphasis') {
          items.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-em' }),
          });
        } else if (name === 'Strikethrough') {
          items.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-strike' }),
          });
        } else if (name === 'InlineCode') {
          items.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-inline-code' }),
          });
        } else if (name === 'Image') {
          // 光标在该 Image 节点的行上时，显示原 markdown 让用户编辑；
          // 否则用 widget 把 ![alt](src) 整段替换为 <img>
          if (!cursorOnNode) {
            const text = state.doc.sliceString(node.from, node.to);
            const m = text.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
            if (m) {
              const [, alt, src] = m;
              items.push({
                from: node.from,
                to: node.to,
                deco: Decoration.replace({
                  widget: new ImageWidget(src, alt),
                }),
              });
              // 跳过子节点（避免 URL / LinkMark 子节点被另外的规则隐藏，造成 widget 范围错乱）
              return false;
            }
          }
        } else if (name === 'Table') {
          // 表格永远渲染成 widget；cell 内的 contentEditable 提供编辑能力，不再依赖光标位置切换原文/视图
          const startLine = state.doc.lineAt(node.from);
          const endLine = state.doc.lineAt(node.to);
          const text = state.doc.sliceString(startLine.from, endLine.to);
          items.push({
            from: startLine.from,
            to: endLine.to,
            deco: Decoration.replace({
              widget: new TableWidget(text),
              block: true,
            }),
          });
          return false;
        } else if (/^ATXHeading[1-6]$/.test(name)) {
          // CommonMark 允许 "###" 单独一行算空 heading，但用户体验上"#"没空格就变大很突兀
          // 所以这里要求 # 后必须跟空格 + 至少一个字符才套大字号样式
          const text = state.doc.sliceString(node.from, node.to);
          const m = text.match(/^(#{1,6})\s+\S/);
          if (m) {
            const level = m[1].length;
            items.push({
              from: node.from,
              to: node.to,
              deco: Decoration.mark({ class: headingClasses[level] }),
            });
          }
        } else if (name === 'Blockquote') {
          items.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-blockquote' }),
          });
        } else if (name === 'Link') {
          items.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-link' }),
          });
        } else if (name === 'Autolink') {
          // CommonMark <url> 形式：整段（含尖括号）套链接样式
          items.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: 'cm-link' }),
          });
        }

        // 行内格式标记（**, *, ~~, `）：光标不在所属节点时才隐藏
        if (
          (name === 'EmphasisMark' ||
            name === 'StrikethroughMark' ||
            name === 'CodeMark') &&
          !cursorOnNode
        ) {
          items.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({}),
          });
        }

        // 行首结构标记（#）：成形（# + 空格 + 内容）就立即隐藏，无视光标
        if (name === 'HeaderMark') {
          const line = state.doc.lineAt(node.from);
          const lineText = state.doc.sliceString(line.from, line.to);
          if (/^#{1,6}\s+\S/.test(lineText)) {
            let hideTo = node.to;
            const next = state.doc.sliceString(node.to, node.to + 1);
            if (next === ' ') hideTo += 1;
            items.push({
              from: node.from,
              to: hideTo,
              deco: Decoration.replace({}),
            });
          }
        }

        // 列表标记：立即渲染为圆点，按嵌套深度选实心 / 空心
        if (name === 'ListMark') {
          const text = state.doc.sliceString(node.from, node.to);
          if (/^[-*+]$/.test(text)) {
            // 任务项 (- [ ] foo / - [x] foo) → 隐藏前缀 "- "，由 TaskMarker widget 取代
            const line = state.doc.lineAt(node.from);
            const lineText = state.doc.sliceString(line.from, line.to);
            if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(lineText)) {
              const next = state.doc.sliceString(node.to, node.to + 1);
              const hideTo = next === ' ' ? node.to + 1 : node.to;
              items.push({
                from: node.from,
                to: hideTo,
                deco: Decoration.replace({}),
              });
            } else {
              // 普通列表：数 BulletList / OrderedList 祖先深度
              let depth = 0;
              let cur = node.node.parent;
              while (cur) {
                if (cur.name === 'BulletList' || cur.name === 'OrderedList') {
                  depth++;
                }
                cur = cur.parent;
              }
              items.push({
                from: node.from,
                to: node.to,
                deco: depth >= 2 ? hollowBulletDeco : bulletDeco,
              });
            }
          }
        }

        // 任务标记 [ ] / [x] → 替换为可勾选 checkbox
        if (name === 'TaskMarker') {
          const text = state.doc.sliceString(node.from, node.to);
          const checked = /\[[xX]\]/.test(text);
          items.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({
              widget: new TaskWidget(checked),
            }),
          });
          if (checked) {
            // 已完成 → 行内剩余文本套灰色删除线
            const line = state.doc.lineAt(node.from);
            const tailFrom = node.to + (state.doc.sliceString(node.to, node.to + 1) === ' ' ? 1 : 0);
            if (tailFrom < line.to) {
              items.push({
                from: tailFrom,
                to: line.to,
                deco: Decoration.mark({ class: 'cm-task-done' }),
              });
            }
          }
        }

        // 链接的 url 部分（光标不在时整体仅显示 link text）
        if (name === 'URL') {
          // 只隐藏 [text](url) 里的 url 子节点；裸 URL（GFM autolink）的顶层 URL
          // 节点父节点不是 Link，永远显示并套上链接样式（裸 URL 本身就是原文）
          const parent = node.node.parent;
          if (parent && parent.name === 'Link') {
            if (!cursorOnNode) {
              items.push({
                from: node.from,
                to: node.to,
                deco: Decoration.replace({}),
              });
            }
          } else {
            items.push({
              from: node.from,
              to: node.to,
              deco: Decoration.mark({ class: 'cm-link' }),
            });
          }
        }
        // 链接的 [ ] ( )
        if (
          (name === 'LinkMark') &&
          !cursorOnNode
        ) {
          items.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({}),
          });
        }
      },
    });

  items.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const it of items) builder.add(it.from, it.to, it.deco);
  return builder.finish();
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
