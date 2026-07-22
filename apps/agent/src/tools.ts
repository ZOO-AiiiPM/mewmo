import type { WriteToolName } from "./contracts";

export const READ_TOOL_NAMES = ["read_current_context", "content_search", "content_read"] as const;
export const WRITE_TOOL_NAMES = [
  "note_create",
  "note_update",
  "note_move",
  "note_move_to_trash",
  "note_restore",
  "knowledge_base_create",
  "knowledge_base_rename",
  "knowledge_item_move",
  "knowledge_item_remove",
] as const satisfies readonly WriteToolName[];

export const ALL_TOOL_NAMES = [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES] as const;

export function isAgentToolName(value: string): value is typeof ALL_TOOL_NAMES[number] {
  return (ALL_TOOL_NAMES as readonly string[]).includes(value);
}
