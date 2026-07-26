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
import type {
  ConversationEvent,
  LegacyStreamEvent,
  PersistedChat,
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
  retry: () => void;
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

      const rows = messagesToTranscriptRows(data.chat.messages ?? []);
      setStableRows(rows);
      setProposals(extractProposals(rows));
      setStatus("idle");
    } catch {
      if (chatIdRef.current === targetChatId && generationRef.current === generation) setStatus("failed");
    }
  }, []);

  // Load on chatId change
  useEffect(() => {
    generationRef.current += 1;
    // Abort any in-flight stream from previous chat
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

    // Create live turn accumulator
    const liveTurn = createLiveTurn(targetChatId, turnId, request.options.content);
    liveTurnRef.current = liveTurn;

    // Set optimistic live row
    setLiveRow({
      turnId,
      userContent: request.options.content,
      assistant: [],
      status: "streaming",
      proposals: [],
    });
    setStatus("sending");
    setFailedRequest(null);

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

      const finalTurn = liveTurnRef.current;
      if (!finalTurn) return;

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
        };
        setLiveRow(null);
        commitRow(emptyRow);
        setFailedRequest({ ...request, turnId: emptyRow.turnId });
        setStatus("failed");
      }
    } catch (error) {
      if (chatIdRef.current !== targetChatId || generationRef.current !== generation) return;
      if (controller.signal.aborted) return; // Intentional abort (chat switch)

      const message = error instanceof Error ? error.message : "Agent 暂时不可用，请重试。";
      const finalTurn = liveTurnRef.current;
      const failedRow: TranscriptRow = {
        turnId: finalTurn?.turnId ?? `failed-${request.clientRequestId}`,
        userContent: request.options.content,
        assistant: finalTurn?.blocks ?? [],
        status: "failed",
        proposals: [],
        error: { message, retryable: true },
      };
      setLiveRow(null);
      commitRow(failedRow);
      setFailedRequest({ ...request, turnId: failedRow.turnId });
      setStatus("failed");
    } finally {
      if (liveTurnRef.current === liveTurn) liveTurnRef.current = null;
      if (abortRef.current === controller) abortRef.current = null;
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

  const reload = useCallback(() => {
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
    retry,
    reload,
    updateProposal,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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

export function upsertTranscriptRow(rows: TranscriptRow[], row: TranscriptRow): TranscriptRow[] {
  const index = rows.findIndex((item) => item.turnId === row.turnId);
  if (index === -1) return [...rows, row];
  return [...rows.slice(0, index), row, ...rows.slice(index + 1)];
}
