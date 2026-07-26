/**
 * ZOO-74: Tool Display Mapper
 *
 * Maps raw tool names to user-friendly product copy.
 * Never expose function names, JSON, provider metadata or internal error stacks.
 */

const TOOL_LABELS: Record<string, string> = {
  // Read tools
  content_search: "正在搜索工作区",
  content_read: "正在读取内容",
  read_current_context: "正在读取当前内容",

  // Write tools
  note_create: "准备创建笔记",
  note_update: "准备更新笔记",
  note_move: "准备移动笔记",
  note_move_to_trash: "准备移入废纸篓",
  note_restore: "准备恢复笔记",
  knowledge_base_create: "准备创建知识库",
  knowledge_base_rename: "准备重命名知识库",
  knowledge_item_move: "准备移动知识库内容",
  knowledge_item_remove: "准备移除知识库关联",
};

const TOOL_DONE_LABELS: Record<string, string> = {
  content_search: "已搜索工作区",
  content_read: "已读取内容",
  read_current_context: "已读取当前内容",
  note_create: "已创建笔记",
  note_update: "已更新笔记",
  note_move: "已移动笔记",
  note_move_to_trash: "已移入废纸篓",
  note_restore: "已恢复笔记",
  knowledge_base_create: "已创建知识库",
  knowledge_base_rename: "已重命名知识库",
  knowledge_item_move: "已移动知识库内容",
  knowledge_item_remove: "已移除知识库关联",
};

/**
 * Get a user-friendly label for a tool in its running state.
 */
export function toolRunningLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? "正在处理";
}

/**
 * Get a user-friendly label for a tool in its completed state.
 */
export function toolDoneLabel(toolName: string): string {
  return TOOL_DONE_LABELS[toolName] ?? "已完成操作";
}

/**
 * Get display text for a tool block given its status.
 */
export function toolDisplayText(toolName: string, status: "running" | "done" | "error"): string {
  if (status === "error") return "操作遇到问题";
  if (status === "done") return toolDoneLabel(toolName);
  return toolRunningLabel(toolName);
}
