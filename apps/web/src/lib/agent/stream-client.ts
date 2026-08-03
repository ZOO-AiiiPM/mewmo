/**
 * ZOO-74: Stream Client
 *
 * SSE consumer with:
 * - Frame parsing (event: / data:)
 * - chatId guard (discard late events from other chats)
 * - seq tracking for reconnection
 * - AbortController support for chat switching
 * - Dual-mode: legacy events + future ConversationEvent protocol
 */

import {
  conversationEventSchema,
  legacyResultPayloadSchema,
  legacyStreamEventSchema,
  publicErrorSchema,
  type ConversationEvent,
  type LegacyResultPayload,
  type LegacyStreamEvent,
} from "./types";

export interface StreamCallbacks {
  onLegacyEvent?: (event: LegacyStreamEvent) => void;
  onConversationEvent?: (event: ConversationEvent) => void;
  onResult?: (result: LegacyResultPayload) => void;
  onError?: (error: { code?: string; message: string; retryable?: boolean }) => void;
  onLifecycle?: (event: StreamLifecycleEvent) => void;
}

export interface StreamLifecycleEvent {
  at: string;
  phase: "event" | "clean_eof" | "transport_error";
  eventType?: string;
  chatId?: string;
  turnId?: string;
  seq?: number;
  errorName?: string;
}

export interface StreamHandle {
  abort: () => void;
  done: Promise<LegacyResultPayload | null>;
}

/**
 * Detect whether an event type belongs to the new ConversationEvent protocol.
 * ConversationEvent types use dot notation (e.g. "turn.started", "assistant.text.delta").
 */
function isConversationEventType(type: string): boolean {
  return type.includes(".");
}

export function parseSseFrame(frame: string): { eventType: string; data: unknown } | null {
  let eventType = "message";
  const data: string[] = [];
  for (const line of frame.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.startsWith("event:")) eventType = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  try {
    return { eventType, data: JSON.parse(data.join("\n")) as unknown };
  } catch {
    return null;
  }
}

/**
 * Consume an SSE stream response.
 *
 * @param response - The fetch Response with SSE body
 * @param chatId - Active chat ID for guard filtering
 * @param callbacks - Event handlers
 * @param signal - AbortSignal for cancellation
 * @returns The final result payload (from "result" event) or null
 */
export async function consumeStream(
  response: Response,
  chatId: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<LegacyResultPayload | null> {
  if (!response.body) throw new Error("Agent 流式响应为空");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: LegacyResultPayload | null = null;

  const processFrame = (frame: string) => {
    const parsedFrame = parseSseFrame(frame);
    if (!parsedFrame) return;
    const { eventType, data } = parsedFrame;

    if (eventType === "result") {
      const parsed = legacyResultPayloadSchema.safeParse(data);
      if (!parsed.success) return;
      const validatedResult = parsed.data as LegacyResultPayload;
      result = validatedResult;
      callbacks.onResult?.(validatedResult);
      callbacks.onLifecycle?.({ at: new Date().toISOString(), phase: "event", eventType });
      return;
    }
    if (eventType === "error") {
      const value = typeof data === "object" && data !== null && "error" in data
        ? (data as { error?: unknown }).error
        : data;
      const parsed = publicErrorSchema.safeParse(value);
      const publicError = parsed.success
        ? {
            ...(parsed.data.code === undefined ? {} : { code: parsed.data.code }),
            message: parsed.data.message,
            ...(parsed.data.retryable === undefined ? {} : { retryable: parsed.data.retryable }),
          }
        : { message: "Agent 请求失败" };
      result = { error: publicError };
      callbacks.onError?.(publicError);
      callbacks.onLifecycle?.({ at: new Date().toISOString(), phase: "event", eventType });
      return;
    }

    if (isConversationEventType(eventType)) {
      const event = conversationEventSchema.safeParse({ ...(typeof data === "object" && data !== null ? data : {}), type: eventType });
      if (!event.success || event.data.chatId !== chatId) return;
      const conversationEvent = event.data as ConversationEvent;
      callbacks.onConversationEvent?.(conversationEvent);
      callbacks.onLifecycle?.({
        at: new Date().toISOString(),
        phase: "event",
        eventType,
        chatId: conversationEvent.chatId,
        turnId: conversationEvent.turnId,
        seq: conversationEvent.seq,
      });
      return;
    }

    const event = legacyStreamEventSchema.safeParse({ ...(typeof data === "object" && data !== null ? data : {}), type: eventType });
    if (event.success) {
      callbacks.onLegacyEvent?.(event.data);
      callbacks.onLifecycle?.({ at: new Date().toISOString(), phase: "event", eventType });
    }
  };

  try {
    while (true) {
      if (signal?.aborted) break;
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) processFrame(frame);

      if (chunk.done) {
        if (buffer.trim()) processFrame(buffer);
        callbacks.onLifecycle?.({ at: new Date().toISOString(), phase: "clean_eof" });
        break;
      }
    }
  } catch (error) {
    callbacks.onLifecycle?.({
      at: new Date().toISOString(),
      phase: "transport_error",
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    throw error;
  } finally {
    reader.releaseLock();
  }

  return result;
}

/**
 * Send a message and consume the SSE stream.
 *
 * @returns The result payload or throws on HTTP/network error
 */
export async function sendAndStream(
  chatId: string,
  body: {
    clientRequestId: string;
    content: string;
    skillId?: string;
    thinking?: boolean;
    context?: { resource: { type: string; id: string; title?: string }; draft?: unknown } | null;
  },
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<LegacyResultPayload | null> {
  const response = await fetch(`/api/agent/chats/${encodeURIComponent(chatId)}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: { message?: string; retryable?: boolean } } | null;
    throw new Error(data?.error?.message ?? "send failed");
  }

  return consumeStream(response, chatId, callbacks, signal);
}
