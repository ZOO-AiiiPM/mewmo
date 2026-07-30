/**
 * #10-F: after an agent write action executes successfully, the affected
 * front-end lists must update without a manual page reload.
 *
 * Two mechanisms cooperate:
 * 1. Detail/tree cache entries are hard-invalidated so the next read refetches.
 * 2. A `mewmo:workspace-refresh` window event broadcasts the changed list keys;
 *    mounted views (sidebar knowledge bases, useWorkspaceResource pages, notes
 *    list) listen and refetch immediately.
 */

import type { AgentActionProposal } from "../agent-contract";
import {
  invalidateWorkspaceResource,
  invalidateWorkspaceResourcePrefix,
} from "../workspace-data-cache";
import { broadcastWorkspaceRefresh } from "../workspace-refresh";
import { workspaceResourceKeys } from "../workspace-resource-keys";

const KNOWLEDGE_TREE_PREFIX = "knowledge:tree:";
const KNOWLEDGE_CONTENTS_PREFIX = "knowledge:contents:";

export interface WorkspaceRefreshPlan {
  /** List keys broadcast to mounted views; cache kept for flicker-free refetch. */
  refreshKeys: string[];
  /** Cache keys deleted outright (details/trees consumed lazily on next read). */
  invalidateKeys: string[];
  invalidatePrefixes: string[];
}

export function planWorkspaceRefresh(
  action: Pick<AgentActionProposal, "toolName" | "preview">,
): WorkspaceRefreshPlan {
  const noteDetailKeys = (action.preview.targets ?? [])
    .filter((target) => target.type === "note")
    .map((target) => workspaceResourceKeys.noteDetail(target.id));
  const keys = workspaceResourceKeys;

  switch (action.toolName) {
    case "note_create":
      return { refreshKeys: [keys.notesList(), keys.todayList()], invalidateKeys: [], invalidatePrefixes: [] };
    case "note_update":
      return { refreshKeys: [keys.notesList(), keys.todayList()], invalidateKeys: noteDetailKeys, invalidatePrefixes: [] };
    case "note_move":
      return {
        refreshKeys: [keys.notesList(), keys.knowledgeBases()],
        invalidateKeys: noteDetailKeys,
        invalidatePrefixes: [KNOWLEDGE_TREE_PREFIX, KNOWLEDGE_CONTENTS_PREFIX],
      };
    case "note_move_to_trash":
    case "note_restore":
      return {
        refreshKeys: [keys.notesList(), keys.todayList(), keys.trashList()],
        invalidateKeys: noteDetailKeys,
        invalidatePrefixes: [KNOWLEDGE_CONTENTS_PREFIX],
      };
    case "knowledge_base_create":
      return { refreshKeys: [keys.knowledgeBases()], invalidateKeys: [], invalidatePrefixes: [] };
    case "knowledge_base_rename":
      return { refreshKeys: [keys.knowledgeBases()], invalidateKeys: [], invalidatePrefixes: [KNOWLEDGE_TREE_PREFIX] };
    case "knowledge_item_move":
    case "knowledge_item_remove":
      return {
        refreshKeys: [keys.knowledgeBases()],
        invalidateKeys: [],
        invalidatePrefixes: [KNOWLEDGE_TREE_PREFIX, KNOWLEDGE_CONTENTS_PREFIX],
      };
    default:
      // Unknown (future) write tool: refresh every workspace list rather than
      // silently leaving stale data on screen.
      return {
        refreshKeys: [keys.notesList(), keys.todayList(), keys.trashList(), keys.knowledgeBases()],
        invalidateKeys: noteDetailKeys,
        invalidatePrefixes: [KNOWLEDGE_TREE_PREFIX, KNOWLEDGE_CONTENTS_PREFIX],
      };
  }
}

/** Executed action ids already handled — status polls may report "succeeded" repeatedly. */
const settledActionIds = new Set<string>();

export function refreshWorkspaceAfterAgentAction(action: AgentActionProposal) {
  if (action.status !== "succeeded" || settledActionIds.has(action.id)) return;
  settledActionIds.add(action.id);

  const plan = planWorkspaceRefresh(action);
  for (const key of plan.invalidateKeys) invalidateWorkspaceResource(key);
  for (const prefix of plan.invalidatePrefixes) invalidateWorkspaceResourcePrefix(prefix);
  broadcastWorkspaceRefresh(plan.refreshKeys);
}
