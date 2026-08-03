import {
  applyConversationEvent,
  applyLegacyEvent,
  mergeResultIntoTerminal,
  type LiveTurnState,
} from "./transcript-adapter";
import type { StreamCallbacks, StreamLifecycleEvent } from "./stream-client";
import type { LegacyResultPayload, TranscriptRow } from "./types";

export interface ConversationStreamOutcome {
  turn: LiveTurnState;
  result: LegacyResultPayload | null;
  terminal: TranscriptRow | null;
  recoveredAfterTerminalTransportError: boolean;
}

interface ConversationStreamLifecycleOptions {
  onTerminal?: (terminal: TranscriptRow, turn: LiveTurnState) => void;
  onLifecycle?: (event: StreamLifecycleEvent) => void;
}

/** Consume one complete send lifecycle while preserving an authoritative terminal event. */
export async function runConversationStream(
  initialTurn: LiveTurnState,
  consume: (callbacks: StreamCallbacks) => Promise<LegacyResultPayload | null>,
  onTurnUpdated: (turn: LiveTurnState) => void,
  options: ConversationStreamLifecycleOptions = {},
): Promise<ConversationStreamOutcome> {
  let turn = initialTurn;
  let result: LegacyResultPayload | null = null;
  let recoveredAfterTerminalTransportError = false;

  const update = (next: LiveTurnState) => {
    if (next === turn) return;
    const terminalReached = !turn.terminal && next.terminal;
    turn = next;
    onTurnUpdated(turn);
    if (terminalReached && next.terminal) options.onTerminal?.(next.terminal, next);
  };

  try {
    result = await consume({
      onLegacyEvent: (event) => update(applyLegacyEvent(turn, event)),
      onConversationEvent: (event) => update(applyConversationEvent(turn, event)),
      ...(options.onLifecycle ? { onLifecycle: options.onLifecycle } : {}),
    });
  } catch (error) {
    if (!turn.terminal) throw error;
    recoveredAfterTerminalTransportError = true;
  }

  return {
    turn,
    result,
    terminal: turn.terminal ? mergeResultIntoTerminal(turn.terminal, result) : null,
    recoveredAfterTerminalTransportError,
  };
}
