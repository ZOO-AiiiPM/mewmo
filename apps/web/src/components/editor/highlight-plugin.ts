import { $command, $inputRule, $markSchema, $remark } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import { toggleMark } from "@milkdown/kit/prose/commands";

/**
 * 自定义高亮（==text==）插件。Crepe / commonmark 原生不支持，这里从零建一个 mark。
 *
 * 为什么手写解析/序列化而非用 micromark-extension-mark：那些现成包是 micromark v1 时代的，
 * 与 Milkdown 7.21 bundle 的 micromark 4 / mdast-util-to-markdown 2 不兼容。这里：
 *  - 解析：transformer 后处理 mdast 树，把 text 里的 ==x== 切成 mark 节点（不碰 micromark，版本无关）
 *  - 序列化：注册 toMarkdownExtensions 的 mark handler，用运行时传入的 state.containerPhrasing
 *    （跟随 Milkdown 自带的 mdast-util-to-markdown 版本）
 * 已知边界：跨其它 inline mark 的 == 不处理；inline code 里的 == 安全（不是 text 节点不切）。
 */

const MARK_RE = /==([^=]+)==/g;

interface MarkdownPhrasingState {
  containerPhrasing(node: unknown, info: { before?: string; after?: string }): string;
}

interface MarkdownExtensionData {
  toMarkdownExtensions?: Array<{
    handlers?: Record<
      string,
      (node: unknown, parent: unknown, state: MarkdownPhrasingState, info: unknown) => string
    >;
  }>;
}

interface MdastNode {
  type?: string;
  value?: unknown;
  children?: MdastNode[];
}

// 把一个 text 字符串按 ==x== 切成 [text, mark, text, ...] mdast 节点
function splitText(value: string): MdastNode[] {
  const parts: MdastNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MARK_RE.lastIndex = 0;
  while ((m = MARK_RE.exec(value))) {
    if (m.index > last) parts.push({ type: "text", value: value.slice(last, m.index) });
    parts.push({ type: "mark", children: [{ type: "text", value: m[1] }] });
    last = m.index + m[0].length;
  }
  if (parts.length === 0) return [{ type: "text", value }];
  if (last < value.length) parts.push({ type: "text", value: value.slice(last) });
  return parts;
}

// 递归遍历 mdast 树，就地展开 text 节点里的高亮语法
function expandHighlights(node: MdastNode) {
  if (!node || !Array.isArray(node.children)) return;
  const out: MdastNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string" && (child.value as string).includes("==")) {
      out.push(...splitText(child.value as string));
    } else {
      expandHighlights(child);
      out.push(child);
    }
  }
  node.children = out;
}

// 序列化：mdast mark 节点 → ==value==
function handleMark(
  node: unknown,
  _parent: unknown,
  state: MarkdownPhrasingState,
  info: unknown,
) {
  const value = state.containerPhrasing(node, { ...(info as object), before: "=", after: "=" });
  return `==${value}==`;
}

const remarkHighlight = $remark("remarkHighlight", () =>
  function () {
    const data = this.data() as MarkdownExtensionData;
    const toMd = (data.toMarkdownExtensions || (data.toMarkdownExtensions = []));
    toMd.push({ handlers: { mark: handleMark } });
    return (tree: unknown) => {
      expandHighlights(tree as MdastNode);
    };
  },
);

export const highlightSchema = $markSchema("highlight", () => ({
  parseDOM: [{ tag: "mark" }],
  toDOM: () => ["mark", 0],
  parseMarkdown: {
    match: (node) => node.type === "mark",
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === "highlight",
    runner: (state, mark) => {
      state.withMark(mark, "mark");
    },
  },
}));

const highlightInputRule = $inputRule((ctx) =>
  new InputRule(/==([^=]+)==$/, (state, match, start, end) => {
    const content = match[1];
    if (!content) return null;
    const markType = highlightSchema.type(ctx);
    return state.tr.replaceWith(start, end, state.schema.text(content, [markType.create()]));
  }),
);

export const toggleHighlightCommand = $command(
  "ToggleHighlight",
  (ctx) => () => toggleMark(highlightSchema.type(ctx)),
);

// 一次性注册用的扁平数组：crepe.editor.use(highlight)
export const highlight = [
  remarkHighlight,
  highlightSchema,
  highlightInputRule,
  toggleHighlightCommand,
].flat();
