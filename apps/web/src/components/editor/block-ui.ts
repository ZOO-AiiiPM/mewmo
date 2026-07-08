import type { BlockEditFeatureConfig } from "@milkdown/crepe/feature/block-edit";
import type { Ctx } from "@milkdown/kit/ctx";
import { editorViewCtx } from "@milkdown/kit/core";
import type { DeriveContext } from "@milkdown/kit/plugin/block";

interface MewmoMenuItem {
  onRun?: (ctx: Ctx) => void;
}

interface MewmoMenuGroup {
  items: MewmoMenuItem[];
}

interface MewmoMenuBuilder {
  build: () => MewmoMenuGroup[];
}

function isCodeOrTableNode(node: { type: { name: string; spec: { code?: boolean } } }) {
  const name = node.type.name.toLowerCase();
  return Boolean(node.type.spec.code) || name.includes("code") || name.includes("table");
}

interface BlockHandleModeContext {
  typeName?: string;
  isStructuralContext?: boolean;
}

interface PreviousEmptyParagraphInput {
  previousTypeName: string | null | undefined;
  previousText: string | null | undefined;
  currentTypeName: string | null | undefined;
  currentIsCodeOrTable: boolean;
}

export function getBlockHandleMode(
  textContent: string | null | undefined,
  context: BlockHandleModeContext = {},
) {
  if (textContent?.trim()) return "drag";
  if (context.typeName && context.typeName !== "paragraph") return "drag";
  if (context.isStructuralContext) return "drag";
  return "add";
}

export function shouldRemovePreviousEmptyParagraph({
  previousTypeName,
  previousText,
  currentIsCodeOrTable,
}: PreviousEmptyParagraphInput) {
  return currentIsCodeOrTable && previousTypeName === "paragraph" && !previousText?.trim();
}

export function getBlockStyleKeyForHandle(
  typeName: string,
  attrs: Record<string, unknown> = {},
) {
  if (typeName === "heading") return attrs.level === 2 ? "h2" : "h1";
  if (typeName === "blockquote") return "quote";
  if (typeName === "bullet_list") return "bullet-list";
  if (typeName === "ordered_list") return "ordered-list";
  if (typeName === "list_item" && "checked" in attrs && attrs.checked !== null) return "task-list";
  if (typeName === "code_block") return "code";
  if (typeName === "table") return "table";
  if (typeName === "paragraph") return "text";
  return "";
}

function getBlockPlacement({ active, blockDom }: DeriveContext) {
  const isStructuralContext = Boolean(active.el.closest("blockquote, table, .milkdown-table-block, .milkdown-code-block"));
  blockDom.dataset.mewmoMode = getBlockHandleMode(active.node.textContent, {
    typeName: active.node.type.name,
    isStructuralContext,
  });
  blockDom.dataset.mewmoStyle = getBlockStyleKeyForHandle(active.node.type.name, active.node.attrs);

  if (active.node.type.name === "heading") return "left";

  let totalDescendant = 0;
  active.node.descendants((node) => {
    totalDescendant += node.childCount;
  });

  const domRect = active.el.getBoundingClientRect();
  const handleRect = blockDom.getBoundingClientRect();
  const style = window.getComputedStyle(active.el);
  const paddingTop = Number.parseInt(style.paddingTop, 10) || 0;
  const paddingBottom = Number.parseInt(style.paddingBottom, 10) || 0;
  const height = domRect.height - paddingTop - paddingBottom;

  return totalDescendant > 2 || handleRect.height < height ? "left-start" : "left";
}

function removeEmptyAdjacentParagraphs(ctx: Ctx) {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const { $from } = state.selection;

  if ($from.depth < 1) return;

  const currentBlockStart = $from.before(1);
  const tr = state.tr;
  const currentNode = $from.node(1);
  const previousNode = tr.doc.resolve(currentBlockStart).nodeBefore;

  if (
    previousNode &&
    shouldRemovePreviousEmptyParagraph({
      previousTypeName: previousNode?.type.name,
      previousText: previousNode?.textContent,
      currentTypeName: currentNode.type.name,
      currentIsCodeOrTable: isCodeOrTableNode(currentNode),
    })
  ) {
    tr.delete(currentBlockStart - previousNode.nodeSize, currentBlockStart);
  }

  if (tr.docChanged) view.dispatch(tr);
}

function keepPlusMenuOnCurrentEmptyLine(builder: MewmoMenuBuilder) {
  for (const group of builder.build()) {
    for (const item of group.items) {
      const run = item.onRun;
      if (!run) continue;

      item.onRun = (ctx) => {
        run(ctx);
        removeEmptyAdjacentParagraphs(ctx);
        window.setTimeout(() => removeEmptyAdjacentParagraphs(ctx), 0);
      };
    }
  }
}

export function getMewmoBlockEditConfig(): BlockEditFeatureConfig {
  return {
    buildMenu: (builder) => keepPlusMenuOnCurrentEmptyLine(builder as MewmoMenuBuilder),
    blockHandle: {
      getOffset: () => 10,
      getPlacement: getBlockPlacement,
    },
    textGroup: {
      label: "Text",
      text: { label: "Text" },
      h1: { label: "Heading 1" },
      h2: { label: "Heading 2" },
      h3: null,
      h4: null,
      h5: null,
      h6: null,
      quote: { label: "Quote" },
      divider: null,
    },
    listGroup: {
      label: "List",
      bulletList: { label: "Bullet List" },
      orderedList: { label: "Numbered List" },
      taskList: { label: "To-do" },
    },
    advancedGroup: {
      label: "Insert",
      image: null,
      codeBlock: { label: "Code" },
      table: { label: "Table" },
      math: null,
    },
  };
}
