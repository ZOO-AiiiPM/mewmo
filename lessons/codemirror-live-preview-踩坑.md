# CodeMirror 6 Live Preview 实现踩坑（block widget + 异步 parse + 光标态）

> 任何"想做 Obsidian 风格 live-preview 渲染"的功能都可能踩这几个坑，统一记下来。

## 1. Block widget 必须通过 StateField 提供，ViewPlugin 提供的会被静默丢弃

**症状**：`Decoration.replace({widget, block: true})` 注册了，syntax tree 也找到节点，items 也 push 了，但渲染结果**没有 widget 出现**——而且**没有任何报错**。

**原因**：CodeMirror 6 的设计：block decorations 影响 layout，必须能在 state 更新阶段就计算好。ViewPlugin 跑在 view update 阶段（DOM 已渲染后），那时候改 layout 来不及。所以 ViewPlugin 提供的 block decorations 会被 view 直接忽略。

**修法**：
```ts
// 错的（block widget 不会显示）
export const livePreview = ViewPlugin.fromClass(class { ... }, {
  decorations: v => v.decorations,
});

// 对的
export const livePreview = StateField.define<DecorationSet>({
  create(state) { return buildDecorations(state); },
  update(deco, tr) {
    if (tr.docChanged || tr.selection) return buildDecorations(tr.state);
    return deco.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f),
});
```

**代价**：StateField 拿不到 view，意味着不能用 `view.visibleRanges` 限制装饰范围——只能整文档遍历。笔记体量小可以接受；大文档需要别的优化。

## 2. lezer-markdown 是异步增量解析，doc 替换后第一次 `syntaxTree(state)` 可能漏节点

**症状**：切换笔记 / 首次加载，明明 markdown 里有 `| col |` 表格，但 widget 不渲染。再敲一下键盘或挪一下光标，就突然显示了。

**原因**：lezer parser 是增量的，doc 大幅替换后会异步往后继续解析。第一次 `syntaxTree(state)` 拿到的可能只是部分树（甚至空树），里面没 Table / TaskMarker 等扩展节点。等用户再操作触发下一次 update 时，parser 已经追上了，于是突然渲染。

**修法**：在 `buildDecorations` 开头强制把解析推到文档末尾：
```ts
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';

function buildDecorations(state: EditorState) {
  ensureSyntaxTree(state, state.doc.length, 50);  // 50ms 软超时
  syntaxTree(state).iterate({ ... });
}
```

`ensureSyntaxTree` 是同步的（在主线程跑 parser work），50ms 超时对小笔记完全够用。

## 3. Cursor-aware 渲染：注意默认光标位置

**症状**：切换笔记后，光标停在文档首行，正好首行是表格 / 标题 / 列表块——livePreview 按"光标在该节点 = 用户在编辑 = 显示原始 markdown"的规则就不渲染 widget 了。用户感觉是"切换笔记完全不渲染"。

**原因**：`view.dispatch({ changes: { from: 0, to: doc.length, insert: content } })` 不指定 selection 时，光标会被映射到 position 0 = 首字符位置。如果首行恰好是 widget 候选块，按行号判断的 `cursorOnNode` 就为 true。

**修法**：dispatch 时显式把光标放到内容末尾或者其他"中性"位置：
```ts
view.dispatch({
  changes: { from: 0, to: view.state.doc.length, insert: content },
  selection: { anchor: content.length },
});
```

更彻底但更复杂的修法：用 `tree.resolveInner(pos)` 沿祖先链查 Table 节点，只有真在 cell 里才算"on table"——而不是按行号粗判。

## 4. 改写 markdown 时小心"啥都没"的 body 行

**症状**：插入空 2×2 表格后点 +列，结果整张表全乱——空 body 行被填进了 `---`。

**原因**：判断"分隔行"用的正则 `/^[\s|:\-]+$/`（允许空白、`|`、`:`、`-`），对**空 body 行 `|   |   |`** 也成立（只含 `\s` 和 `|`）。

**修法**：不要用字符类判断，用位置判断——表格里第二条含 `|` 的行才是分隔行：
```ts
const tableLineIdx = lines.map((l,i) => l.includes('|') ? i : -1).filter(i => i >= 0);
const delimLineIdx = tableLineIdx[1];
const isDelim = idx === delimLineIdx;
```

**通用教训**：判断 markdown 结构语义时，**结构位置**（第几条含某字符的行）比**字符模式**（regex 匹配字符类）更稳——因为空白单元格的字符集是字符模式判断的盲区。

## 调试这类多重失败的方法论

四个症状一起出现时容易当成一个 bug 修，但 CodeMirror live-preview 这种链路长的功能（parser → syntax tree → decoration → widget → DOM）每一层都可能 silent fail，必须分层验证：

1. parser 层：`syntaxTree(state).topNode` 打印一下，确认有目标节点
2. decoration 层：`builder.add` 调用次数计数，确认 items 被加进去
3. view 层：渲染后 query DOM，确认 widget DOM 被插入

每层都先确认"应该有的东西到这一层时还在"，再往下走，避免在错误的层调试半天。
