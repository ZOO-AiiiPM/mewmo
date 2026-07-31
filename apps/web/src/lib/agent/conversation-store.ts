/**
 * ZOO-74: Conversation Store
 *
 * React hook managing:
 * - stableRows: persisted transcript loaded from API
 * - liveRow: current streaming turn (ephemeral)
 * - reconciliation: turn.completed replaces liveRow -> stableRows
 * - deduplication by (turnId, seq)
 * - optimistic user message + pending assistant
 * - failure/retry in-place
 * - user-initiated stop (client-side stream abort; see stop())
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AgentActionProposal } from "../agent-contract";
import {
  applyConversationEvent,
  applyLegacyEvent,
  createLiveTurn,
  finalizeLegacyTurn,
  mergeResultIntoTerminal,
  messagesToTranscriptRows,
  type LiveTurnState,
} from "./transcript-adapter";
import { sendAndStream } from "./stream-client";
import { publicErrorMessage } from "./tool-display";
import type {
  ConversationEvent,
  LegacyStreamEvent,
  PersistedChat,
  TranscriptContextChip,
  TranscriptRow,
} from "./types";

export type SendStatus = "idle" | "loading" | "sending" | "failed";

export interface ConversationStoreState {
  stableRows: TranscriptRow[];
  liveRow: TranscriptRow | null;
  status: SendStatus;
  failedRequest: FailedRequest | null;
  proposals: AgentActionProposal[];
}

export interface FailedRequest {
  clientRequestId: string;
  options: SendOptions;
  turnId: string;
  attempt: number;
}

export interface SendOptions {
  content: string;
  skillId?: string;
  context?: {
    resource: { type: string; id: string; title?: string };
    draft?: unknown;
  } | null;
}

export interface ConversationStore extends ConversationStoreState {
  send: (options: SendOptions) => void;
  /**
   * Edit/regenerate fork semantics: truncate the chat from `turnId` (that turn
   * and everything after it) before sending, so the new message replaces the
   * original instead of appending. Falls back to a plain append when the
   * truncate call fails, so the send is never blocked.
   */
  sendReplacing: (turnId: string, options: SendOptions) => void;
  retry: () => void;
  /**
   * Stop the current streaming turn client-side. The server has no turn-abort
   * endpoint, so generation continues remotely and the persisted reply may be
   * longer than what stays on screen; the local row is committed as stopped.
   */
  stop: () => void;
  reload: () => void;
  updateProposal: (proposal: AgentActionProposal) => void;
}

/**
 * Main conversation store hook.
 * Manages the transcript for a single chat, with stable/live separation.
 */
export function useConversationStore(chatId: string | null): ConversationStore {
  const [stableRows, setStableRows] = useState<TranscriptRow[]>([]);
  const [liveRow, setLiveRow] = useState<TranscriptRow | null>(null);
  const [status, setStatus] = useState<SendStatus>("idle");
  const [failedRequest, setFailedRequest] = useState<FailedRequest | null>(null);
  const [proposals, setProposals] = useState<AgentActionProposal[]>([]);

  const liveTurnRef = useRef<LiveTurnState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopRequestedRef = useRef(false);
  const generationRef = useRef(0);
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;

  // -------------------------------------------------------------------------
  // Load persisted transcript
  // -------------------------------------------------------------------------

  const loadTranscript = useCallback(async (targetChatId: string) => {
    const generation = ++generationRef.current;
    setStatus("loading");
    try {
      const response = await fetch(`/api/agent/chats/${encodeURIComponent(targetChatId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load failed");
      const data = await response.json() as { chat?: PersistedChat };
      if (!data.chat) throw new Error("chat not found");

      // Guard: only apply if still on the same chat
      if (chatIdRef.current !== targetChatId || generationRef.current !== generation) return;

      const persistedRows = messagesToTranscriptRows(data.chat.messages ?? []);
      const currentProposals = await refreshProposalStates(extractProposals(persistedRows));

      if (chatIdRef.current !== targetChatId || generationRef.current !== generation) return;

      const rows = replaceTranscriptProposals(persistedRows, currentProposals);
      setStableRows(rows);
      setProposals(currentProposals);
      setStatus("idle");
    } catch {
      if (chatIdRef.current === targetChatId && generationRef.current === generation) setStatus("failed");
    }
  }, []);

  // Load on chatId change
  useEffect(() => {
    generationRef.current += 1;
    // Abort any in-flight stream from previous chat
    stopRequestedRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    liveTurnRef.current = null;
    setLiveRow(null);
    setStableRows([]);
    setProposals([]);
    setFailedRequest(null);

    if (chatId) {
      void loadTranscript(chatId);
    } else {
      setStatus("idle");
    }
  }, [chatId, loadTranscript]);

  // -------------------------------------------------------------------------
  // Send message
  // -------------------------------------------------------------------------

  const performSend = useCallback(async (request: FailedRequest) => {
    const targetChatId = chatIdRef.current;
    if (!targetChatId) return;

    const generation = ++generationRef.current;
    const turnId = `live-${request.clientRequestId}`;
    const controller = new AbortController();
    abortRef.current = controller;
    stopRequestedRef.current = false;

    // #6: chip shown on the user message when the send carries page context
    const contextChip = sendContextChip(request.options);

    // Create live turn accumulator
    const liveTurn = createLiveTurn(targetChatId, turnId, request.options.content, contextChip);
    liveTurnRef.current = liveTurn;

    // Set optimistic live row
    setLiveRow({
      turnId,
      userContent: request.options.content,
      assistant: [],
      status: "streaming",
      proposals: [],
      ...(contextChip ? { contextChip } : {}),
    });
    setStatus("sending");
    setFailedRequest(null);

    // User pressed stop: keep whatever streamed so far as a completed row.
    // The server keeps generating (no turn-abort endpoint); reload() would
    // reveal the full persisted reply.
    const commitStoppedRow = () => {
      stopRequestedRef.current = false;
      const finalTurn = liveTurnRef.current;
      const stoppedRow: TranscriptRow = {
        turnId: finalTurn?.turnId ?? turnId,
        userContent: request.options.content,
        assistant: finalTurn?.blocks ?? [],
        status: "completed",
        proposals: finalTurn?.proposals ?? [],
        stopped: true,
      };
      commitRow(stoppedRow);
      setFailedRequest(null);
      setStatus("idle");
    };

    try {
      const result = await sendAndStream(
        targetChatId,
        {
          clientRequestId: request.clientRequestId,
          content: request.options.content,
          ...(request.options.skillId ? { skillId: request.options.skillId } : {}),
          context: request.options.context ?? null,
        },
        {
          onLegacyEvent: (event: LegacyStreamEvent) => {
            if (chatIdRef.current !== targetChatId || generationRef.current !== generation) return;
            const current = liveTurnRef.current;
            if (!current) return;
            const updated = applyLegacyEvent(current, event);
            liveTurnRef.current = updated;
            syncLiveRow(updated, "streaming");
          },
          onConversationEvent: (event: ConversationEvent) => {
            if (chatIdRef.current !== targetChatId || generationRef.current !== generation) return;
            const current = liveTurnRef.current;
            if (!current) return;
            const updated = applyConversationEvent(current, event);
            liveTurnRef.current = updated;
            syncLiveRow(updated, updated.terminal?.status ?? "streaming");
          },
        },
        controller.signal,
      );

      // Guard: ensure we're still on the same chat
      if (chatIdRef.current !== targetChatId || generationRef.current !== generation) return;

      // Stream loop exited because the user stopped generation
      if (controller.signal.aborted && stopRequestedRef.current) {
        commitStoppedRow();
        return;
      }

      const finalTurn = liveTurnRef.current;
      if (!finalTurn) return;

      if (finalTurn.hasSequenceGap) {
        const failedRequest = finalTurn.terminal?.status === "failed"
          ? { ...request, turnId: finalTurn.terminal.turnId }
          : null;
        setLiveRow(null);
        await loadTranscript(targetChatId);
        if (chatIdRef.current !== targetChatId) return;
        if (failedRequest) {
          setFailedRequest(failedRequest);
          setStatus("failed");
        }
        return;
      }

      if (finalTurn.terminal) {
        const terminal = mergeResultIntoTerminal(finalTurn.terminal, result);
        commitRow(terminal);
        if (terminal.status === "failed") {
          setFailedRequest({ ...request, turnId: terminal.turnId });
          setStatus("failed");
        } else {
          setFailedRequest(null);
          setStatus("idle");
        }
        return;
      }

      if (result?.error?.message) {
        // Failed turn
        const failedRow = finalizeLegacyTurn(finalTurn, result);
        setLiveRow(null);
        commitRow(failedRow);
        setFailedRequest({ ...request, turnId: failedRow.turnId });
        setStatus("failed");
        return;
      }

      if (result) {
        // Successful turn — reconcile
        const completedRow = finalizeLegacyTurn(finalTurn, result);
        setLiveRow(null);
        commitRow(completedRow);
        setProposals((current) => mergeProposals(current, completedRow.proposals));
        setStatus("idle");
      } else {
        // No result received (stream ended without result event)
        const emptyRow: TranscriptRow = {
          turnId: finalTurn.turnId,
          userContent: finalTurn.userContent,
          assistant: finalTurn.blocks,
          status: "failed",
          proposals: [],
          error: { message: "Agent 未返回完整结果", retryable: true },
          ...(finalTurn.contextChip ? { contextChip: finalTurn.contextChip } : {}),
        };
        setLiveRow(null);
        commitRow(emptyRow);
        setFailedRequest({ ...request, turnId: emptyRow.turnId });
        setStatus("failed");
      }
    } catch (error) {
      if (chatIdRef.current !== targetChatId || generationRef.current !== generation) return;
      if (controller.signal.aborted) {
        // User-initiated stop keeps the partial reply; chat-switch aborts stay silent.
        if (stopRequestedRef.current) commitStoppedRow();
        return;
      }

      const message = publicErrorMessage(error instanceof Error ? error.message : null);
      const finalTurn = liveTurnRef.current;
      const failedRow: TranscriptRow = {
        turnId: finalTurn?.turnId ?? `failed-${request.clientRequestId}`,
        userContent: request.options.content,
        assistant: finalTurn?.blocks ?? [],
        status: "failed",
        proposals: [],
        error: { message, retryable: true },
        ...(contextChip ? { contextChip } : {}),
      };
      setLiveRow(null);
      commitRow(failedRow);
      setFailedRequest({ ...request, turnId: failedRow.turnId });
      setStatus("failed");
    } finally {
      if (abortRef.current === controller) {
        liveTurnRef.current = null;
        abortRef.current = null;
      }
    }
  }, []);

  const send = useCallback((options: SendOptions) => {
    const content = options.content.trim();
    if (!content || !chatIdRef.current || status === "sending") return;
    const request: FailedRequest = {
      clientRequestId: crypto.randomUUID(),
      options: { ...options, content },
      turnId: "",
      attempt: 1,
    };
    void performSend(request);
  }, [performSend, status]);

  const sendReplacing = useCallback((turnId: string, options: SendOptions) => {
    const content = options.content.trim();
    if (!content || !chatIdRef.current || status === "sending") return;
    const targetChatId = chatIdRef.current;
    void (async () => {
      // Truncate failures degrade gracefully: the resend just appends instead.
      const truncated = await fetch(`/api/agent/chats/${encodeURIComponent(targetChatId)}/truncate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnId }),
      }).then((response) => response.ok, () => false);
      if (chatIdRef.current !== targetChatId) return;
      if (truncated) {
        setStableRows((rows) => {
          const index = rows.findIndex((row) => row.turnId === turnId);
          return index === -1 ? rows : rows.slice(0, index);
        });
      }
      const request: FailedRequest = {
        clientRequestId: crypto.randomUUID(),
        options: { ...options, content },
        turnId: "",
        attempt: 1,
      };
      await performSend(request);
    })();
  }, [performSend, status]);

  const retry = useCallback(() => {
    if (!failedRequest) return;
    const newRequest: FailedRequest = {
      ...failedRequest,
      clientRequestId: crypto.randomUUID(),
      turnId: "",
      attempt: failedRequest.attempt + 1,
    };
    setStableRows((rows) => rows.filter((row) => row.turnId !== failedRequest.turnId));
    void performSend(newRequest);
  }, [failedRequest, performSend]);

  const stop = useCallback(() => {
    const controller = abortRef.current;
    if (!controller || controller.signal.aborted) return;
    stopRequestedRef.current = true;
    controller.abort();
  }, []);

  const reload = useCallback(() => {
    stopRequestedRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    liveTurnRef.current = null;
    setLiveRow(null);
    setStableRows([]);
    setProposals([]);
    setFailedRequest(null);
    if (chatIdRef.current) void loadTranscript(chatIdRef.current);
  }, [loadTranscript]);

  const updateProposal = useCallback((proposal: AgentActionProposal) => {
    setProposals((current) => mergeProposals(current, [proposal]));
    // Also update in stable rows
    setStableRows((rows) =>
      rows.map((row) => {
        const hasProposal = row.proposals.some((p) => p.id === proposal.id);
        if (!hasProposal) return row;
        return {
          ...row,
          proposals: row.proposals.map((p) => (p.id === proposal.id ? proposal : p)),
          assistant: row.assistant.map((block) =>
            block.kind === "confirmation" && block.proposal.id === proposal.id
              ? { ...block, proposal }
              : block,
          ),
        };
      }),
    );
  }, []);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function syncLiveRow(turn: LiveTurnState, rowStatus: "streaming" | "completed" | "failed") {
    setLiveRow({
      turnId: turn.turnId,
      userContent: turn.userContent,
      assistant: turn.blocks,
      status: rowStatus,
      proposals: turn.proposals,
      ...(turn.contextChip ? { contextChip: turn.contextChip } : {}),
    });
  }

  function commitRow(row: TranscriptRow) {
    setLiveRow(null);
    setStableRows((rows) => upsertTranscriptRow(rows, row));
    setProposals((current) => mergeProposals(current, row.proposals));
  }

  return {
    stableRows,
    liveRow,
    status,
    failedRequest,
    proposals,
    send,
    sendReplacing,
    retry,
    stop,
    reload,
    updateProposal,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** #6: derive the transcript chip from the context attached to a send. */
export function sendContextChip(options: SendOptions): TranscriptContextChip | undefined {
  const resource = options.context?.resource;
  if (!resource) return undefined;
  return { kind: resource.type, title: resource.title ?? "" };
}

function extractProposals(rows: TranscriptRow[]): AgentActionProposal[] {
  const map = new Map<string, AgentActionProposal>();
  for (const row of rows) {
    for (const proposal of row.proposals) {
      map.set(proposal.id, proposal);
    }
  }
  return [...map.values()];
}

function mergeProposals(current: AgentActionProposal[], incoming: AgentActionProposal[]): AgentActionProposal[] {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()];
}

async function refreshProposalStates(proposals: AgentActionProposal[]): Promise<AgentActionProposal[]> {
  return Promise.all(proposals.map(async (proposal) => {
    try {
      const response = await fetch(`/api/agent/actions/${encodeURIComponent(proposal.id)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null) as { action?: AgentActionProposal } | null;
      return response.ok && data?.action ? data.action : proposal;
    } catch {
      return proposal;
    }
  }));
}

export function replaceTranscriptProposals(
  rows: TranscriptRow[],
  currentProposals: AgentActionProposal[],
): TranscriptRow[] {
  const proposalsById = new Map(currentProposals.map((proposal) => [proposal.id, proposal]));
  return rows.map((row) => ({
    ...row,
    proposals: row.proposals.map((proposal) => proposalsById.get(proposal.id) ?? proposal),
    assistant: row.assistant.map((block) => block.kind === "confirmation"
      ? { ...block, proposal: proposalsById.get(block.proposal.id) ?? block.proposal }
      : block),
  }));
}

export function upsertTranscriptRow(rows: TranscriptRow[], row: TranscriptRow): TranscriptRow[] {
  const index = rows.findIndex((item) => item.turnId === row.turnId);
  if (index === -1) return [...rows, row];
  return [...rows.slice(0, index), row, ...rows.slice(index + 1)];
}
