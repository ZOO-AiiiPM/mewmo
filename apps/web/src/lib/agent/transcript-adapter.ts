/**
 * ZOO-74: Transcript Adapter
 *
 * Converts backend SSE events into TranscriptRow updates.
 * Dual-mode: handles both legacy events (current apps/agent) and
 * future ConversationEvent protocol (post Agent A upgrade).
 *
 * Aggregation rule: assistant(toolCall) -> toolResult -> assistant(final)
 * all belong to ONE assistant turn, rendered as blocks within a single row.
 */

import type { AgentActionProposal } from "../agent-contract";
import { toolRunningLabel, toolDoneLabel } from "./tool-display";
import type {
  AssistantBlock,
  ConversationEvent,
  LegacyResultPayload,
  LegacyStreamEvent,
  PersistedMessage,
  TranscriptRow,
} from "./types";

// ---------------------------------------------------------------------------
// Live Turn Accumulator
// ---------------------------------------------------------------------------

export interface LiveTurnState {
  chatId: string;
  turnId: string;
  serverTurnId?: string;
  userContent: string;
  blocks: AssistantBlock[];
  proposals: AgentActionProposal[];
  lastSeq: number;
  hasSequenceGap: boolean;
  terminal?: TranscriptRow;
}

export function createLiveTurn(chatId: string, turnId: string, userContent: string): LiveTurnState {
  return { chatId, turnId, userContent, blocks: [], proposals: [], lastSeq: 0, hasSequenceGap: false };
}

// ---------------------------------------------------------------------------
// Legacy Event Processing (current backend format)
// ---------------------------------------------------------------------------

/**
 * Apply a legacy stream event to the live turn state.
 * Returns a new state (immutable update pattern for React).
 */
export function applyLegacyEvent(state: LiveTurnState, event: LegacyStreamEvent): LiveTurnState {
  switch (event.type) {
    case "text_delta": {
      const lastBlock = state.blocks[state.blocks.length - 1];
      if (lastBlock && lastBlock.kind === "text") {
        // Append to existing text block
        return {
          ...state,
          blocks: [
            ...state.blocks.slice(0, -1),
            { ...lastBlock, content: lastBlock.content + event.delta },
          ],
        };
      }
      // Start a new text block
      return { ...state, blocks: [...state.blocks, { kind: "text", content: event.delta }] };
    }

    case "thinking_delta": {
      const lastBlock = state.blocks[state.blocks.length - 1];
      if (lastBlock && lastBlock.kind === "thinking") {
        return {
          ...state,
          blocks: [
            ...state.blocks.slice(0, -1),
            { ...lastBlock, content: lastBlock.content + event.delta },
          ],
        };
      }
      return { ...state, blocks: [...state.blocks, { kind: "thinking", content: event.delta }] };
    }

    case "tool_start": {
      return {
        ...state,
        blocks: [
          ...state.blocks,
          {
            kind: "tool",
            toolCallId: event.toolCallId,
            display: toolRunningLabel(event.toolName),
            status: "running",
          },
        ],
      };
    }

    case "tool_end": {
      return {
        ...state,
        blocks: state.blocks.map((block) =>
          block.kind === "tool" && block.toolCallId === event.toolCallId
            ? {
                ...block,
                status: event.isError ? "error" as const : "done" as const,
                display: event.isError ? "操作遇到问题" : toolDoneLabel(event.toolName),
              }
            : block,
        ),
      };
    }

    case "start":
    case "compaction":
    case "end":
      return state;

    default:
      return state;
  }
}

/**
 * Finalize a live turn with the legacy result payload.
 * Produces the completed TranscriptRow.
 */
export function finalizeLegacyTurn(
  state: LiveTurnState,
  result: LegacyResultPayload,
): TranscriptRow {
  if (result.error?.message) {
    return {
      turnId: state.turnId,
      userContent: state.userContent,
      assistant: state.blocks,
      status: "failed",
      proposals: state.proposals,
      error: {
        message: result.error.message,
        retryable: result.error.retryable ?? true,
      },
    };
  }

  const finalContent = result.assistantMessage?.content ?? "";
  const proposals = result.proposals ?? [];

  // If we have a definitive final answer, ensure the last text block reflects it
  const blocks = reconcileFinalText(state.blocks, finalContent);

  // Add confirmation blocks for proposals
  const confirmationBlocks: AssistantBlock[] = proposals.map((proposal) => ({
    kind: "confirmation" as const,
    proposal,
  }));

  return {
    turnId: state.turnId,
    userContent: state.userContent,
    assistant: [...blocks, ...confirmationBlocks],
    status: "completed",
    proposals,
  };
}

// ---------------------------------------------------------------------------
// ConversationEvent Processing (future protocol, Spec §8)
// ---------------------------------------------------------------------------

/**
 * Apply a stable ConversationEvent to the live turn state.
 * Deduplicates by (turnId, seq).
 */
export function applyConversationEvent(
  state: LiveTurnState,
  event: ConversationEvent,
): LiveTurnState {
  if (event.chatId !== state.chatId) return state;
  if (event.type !== "turn.started" && state.serverTurnId && event.turnId !== state.serverTurnId) return state;
  if (event.seq <= state.lastSeq) return state;
  const withSeq = {
    ...state,
    lastSeq: event.seq,
    hasSequenceGap: state.hasSequenceGap || (state.lastSeq > 0 && event.seq > state.lastSeq + 1),
  };

  switch (event.type) {
    case "turn.started": {
      if (state.serverTurnId && state.serverTurnId !== event.turnId) return state;
      return { ...withSeq, turnId: event.turnId, serverTurnId: event.turnId };
    }

    case "assistant.text.delta": {
      const lastBlock = withSeq.blocks[withSeq.blocks.length - 1];
      if (lastBlock && lastBlock.kind === "text") {
        return {
          ...withSeq,
          blocks: [
            ...withSeq.blocks.slice(0, -1),
            { ...lastBlock, content: lastBlock.content + event.delta },
          ],
        };
      }
      return { ...withSeq, blocks: [...withSeq.blocks, { kind: "text", content: event.delta }] };
    }

    case "tool.started": {
      const display = event.display?.label ?? toolRunningLabel(event.tool);
      return {
        ...withSeq,
        blocks: [
          ...withSeq.blocks,
          { kind: "tool", toolCallId: event.toolCallId, display, status: "running" },
        ],
      };
    }

    case "tool.completed": {
      const display = event.display?.label ?? "已完成操作";
      return {
        ...withSeq,
        blocks: withSeq.blocks.map((block) =>
          block.kind === "tool" && block.toolCallId === event.toolCallId
            ? { ...block, status: "done" as const, display }
            : block,
        ),
      };
    }

    case "confirmation.required":
      // Confirmation blocks are added via proposals in turn.completed
      return withSeq;

    case "turn.completed": {
      const proposals = event.message.proposals ?? [];
      const blocks = reconcileFinalText(withSeq.blocks, event.message.content);
      const terminal: TranscriptRow = {
        turnId: event.turnId,
        userContent: withSeq.userContent,
        assistant: [
          ...blocks,
          ...proposals.map((proposal) => ({ kind: "confirmation" as const, proposal })),
        ],
        status: "completed",
        proposals,
        ...(event.message.createdAt ? { createdAt: event.message.createdAt } : {}),
      };
      return { ...withSeq, turnId: event.turnId, serverTurnId: event.turnId, proposals, terminal };
    }

    case "turn.failed": {
      const terminal: TranscriptRow = {
        turnId: event.turnId,
        userContent: withSeq.userContent,
        assistant: withSeq.blocks,
        status: "failed",
        proposals: withSeq.proposals,
        error: { message: event.error.message, retryable: event.retryable && event.error.retryable },
      };
      return { ...withSeq, turnId: event.turnId, serverTurnId: event.turnId, terminal };
    }

    default:
      return withSeq;
  }
}

// ---------------------------------------------------------------------------
// Persisted Messages -> TranscriptRows
// ---------------------------------------------------------------------------

/**
 * Convert persisted messages from the API into stable TranscriptRows.
 * Messages carrying a turnId are grouped by real turn identity; messages
 * without one (pre-turn history) fall back to legacy adjacency pairing.
 */
export function messagesToTranscriptRows(messages: PersistedMessage[]): TranscriptRow[] {
  interface RowUnit { user: PersistedMessage | null; assistant: PersistedMessage | null }
  const units: RowUnit[] = [];
  const unitsByTurn = new Map<string, RowUnit>();
  let pendingLegacyUser: RowUnit | null = null;

  for (const message of messages) {
    // Skip "tool" role messages — they are internal
    if (message.role !== "user" && message.role !== "assistant") continue;

    if (message.turnId) {
      let unit = unitsByTurn.get(message.turnId);
      if (!unit) {
        unit = { user: null, assistant: null };
        unitsByTurn.set(message.turnId, unit);
        units.push(unit);
      }
      if (message.role === "user") {
        if (!unit.user) unit.user = message;
      } else {
        unit.assistant = message;
      }
      pendingLegacyUser = null;
      continue;
    }

    if (message.role === "user") {
      const unit: RowUnit = { user: message, assistant: null };
      units.push(unit);
      pendingLegacyUser = unit;
    } else if (pendingLegacyUser && !pendingLegacyUser.assistant) {
      pendingLegacyUser.assistant = message;
      pendingLegacyUser = null;
    } else {
      // Orphan assistant message (e.g. welcome)
      units.push({ user: null, assistant: message });
    }
  }

  return units.map((unit) => {
    if (unit.user) return buildRowFromPair(unit.user, unit.assistant);
    const assistant = unit.assistant;
    if (!assistant) return null;
    return {
      turnId: assistant.turnId ?? assistant.id,
      userContent: "",
      assistant: [{ kind: "text" as const, content: assistant.content }],
      status: assistant.status === "failed" ? "failed" as const : "completed" as const,
      proposals: assistant.metadata?.proposals ?? [],
    };
  }).filter((row): row is TranscriptRow => row !== null);
}

/**
 * Reconcile the legacy `result` payload with a row settled by a stable
 * terminal event. The landed backend (#33) delivers full action proposals
 * only on the legacy result — the stable turn.completed message carries
 * none — so adopt them idempotently instead of dropping confirmations.
 */
export function mergeResultIntoTerminal(
  row: TranscriptRow,
  result: LegacyResultPayload | null,
): TranscriptRow {
  if (!result || row.status !== "completed" || row.proposals.length > 0) return row;
  const proposals = result.proposals ?? [];
  if (proposals.length === 0) return row;
  return {
    ...row,
    proposals,
    assistant: [
      ...row.assistant,
      ...proposals.map((proposal) => ({ kind: "confirmation" as const, proposal })),
    ],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRowFromPair(
  user: PersistedMessage,
  assistant: PersistedMessage | null,
): TranscriptRow {
  const proposals = assistant?.metadata?.proposals ?? [];
  const blocks: AssistantBlock[] = [];

  if (assistant && assistant.content) {
    blocks.push({ kind: "text", content: assistant.content });
  }

  for (const proposal of proposals) {
    blocks.push({ kind: "confirmation", proposal });
  }

  const error = assistant?.error ?? user.error;
  const missingAssistant = !assistant;

  return {
    turnId: assistant?.turnId ?? user.turnId ?? assistant?.id ?? user.id,
    userContent: user.content,
    assistant: blocks,
    status: assistant?.status === "failed" || missingAssistant ? "failed" : "completed",
    proposals,
    ...((assistant?.createdAt ?? user.createdAt) ? { createdAt: assistant?.createdAt ?? user.createdAt } : {}),
    ...(error ? { error } : missingAssistant ? { error: { message: "这次回复未完成。", retryable: false } } : {}),
  };
}

/**
 * Ensure the final text content from the result is correctly reflected.
 * If streaming produced text blocks but the final answer differs,
 * replace/append to match the authoritative final content.
 */
function reconcileFinalText(blocks: AssistantBlock[], finalContent: string): AssistantBlock[] {
  if (!finalContent) return blocks;

  // Find the last text block
  const lastTextIndex = blocks.map((b) => b.kind).lastIndexOf("text");
  if (lastTextIndex === -1) {
    // No text block yet, add one
    return [...blocks, { kind: "text", content: finalContent }];
  }

  const lastText = blocks[lastTextIndex];
  if (!lastText || lastText.kind !== "text") return blocks;

  // If streaming text matches or is a prefix of final, use final (authoritative)
  if (finalContent.startsWith(lastText.content) || lastText.content !== finalContent) {
    return [
      ...blocks.slice(0, lastTextIndex),
      { kind: "text", content: finalContent },
      ...blocks.slice(lastTextIndex + 1),
    ];
  }

  return blocks;
}
