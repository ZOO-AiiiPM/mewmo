import type { Editor } from "@milkdown/kit/core";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  addBlockTypeCommand,
  blockquoteSchema,
  codeBlockSchema,
  listItemSchema,
  selectTextNearPosCommand,
  setBlockTypeCommand,
  wrapInBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import { createTable } from "@milkdown/kit/preset/gfm";
import { toggleHighlightCommand } from "./highlight-plugin";

export type InsertKind = "task" | "quote" | "table" | "code";

/**
 * 一键插入块。逻辑直接复刻 Crepe 斜杠菜单的 onRun
 * (@milkdown/crepe/src/feature/block-edit/menu/config.ts)，
 * 复用库自身的命令，底部工具栏（及未来快捷键）共用此单一真相源。
 */
export function insertBlock(editor: Editor | undefined, kind: InsertKind) {
  if (!editor) return;
  editor.action((ctx) => {
    const commands = ctx.get(commandsCtx);
    // 与 Crepe 斜杠菜单不同：不调 clearTextInCurrentBlockCommand。斜杠菜单要清掉
    // "/quote" 这类触发文本，而工具栏按钮作用在用户的真实内容上——清空会误删本行文字。
    // 不清 = 「把当前行就地转成 X」语义（有字 wrap 进去，空行得到空块）。
    switch (kind) {
      case "quote":
        commands.call(wrapInBlockTypeCommand.key, {
          nodeType: blockquoteSchema.type(ctx),
        });
        break;
      case "task":
        commands.call(wrapInBlockTypeCommand.key, {
          nodeType: listItemSchema.type(ctx),
          attrs: { checked: false },
        });
        break;
      case "code":
        commands.call(setBlockTypeCommand.key, {
          nodeType: codeBlockSchema.type(ctx),
        });
        break;
      case "table": {
        const view = ctx.get(editorViewCtx);
        const { from } = view.state.selection;
        commands.call(addBlockTypeCommand.key, {
          nodeType: createTable(ctx, 3, 3),
        });
        commands.call(selectTextNearPosCommand.key, { pos: from });
        break;
      }
    }
  });
}

/**
 * 切换高亮（行内 mark）。与 insertBlock 区分：高亮不是块，是选区上的标记。
 * 有选区 → 高亮选中文字；无选区 → 切换 stored mark，下段输入即高亮。
 */
export function toggleHighlight(editor: Editor | undefined) {
  if (!editor) return;
  editor.action((ctx) => {
    ctx.get(commandsCtx).call(toggleHighlightCommand.key);
  });
}
