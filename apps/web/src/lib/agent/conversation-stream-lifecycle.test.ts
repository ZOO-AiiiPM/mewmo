import { describe, expect, it, vi } from "vitest";

import { runConversationStream } from "./conversation-stream-lifecycle";
import { consumeStream } from "./stream-client";
import { createLiveTurn } from "./transcript-adapter";
import type { LegacyResultPayload } from "./types";

describe("conversation stream lifecycle", () => {
  it("settles the UI on turn.completed without waiting for trailing result or EOF", async () => {
    let callbacks!: Parameters<Parameters<typeof runConversationStream>[1]>[0];
    let finishStream!: (result: LegacyResultPayload | null) => void;
    const ui = {
      rowStatus: "streaming" as "streaming" | "completed" | "failed",
      storeStatus: "sending" as "sending" | "idle" | "failed",
      stopVisible: true,
      composerEnabled: false,
    };
    const stream = runConversationStream(
      createLiveTurn("chat-1", "live-request-1", "hello"),
      (streamCallbacks) => {
        callbacks = streamCallbacks;
        return new Promise<LegacyResultPayload | null>((resolve) => {
          finishStream = resolve;
        });
      },
      () => undefined,
      {
        onTerminal: (terminal) => {
          ui.rowStatus = terminal.status;
          ui.storeStatus = terminal.status === "failed" ? "failed" : "idle";
          ui.stopVisible = false;
          ui.composerEnabled = terminal.status === "completed";
        },
      },
    );

    callbacks.onConversationEvent?.({
      type: "turn.completed",
      chatId: "chat-1",
      turnId: "turn-1",
      seq: 1,
      message: {
        id: "message-1",
        role: "assistant",
        content: "complete answer",
        status: "completed",
        createdAt: "2026-08-01T09:28:16.000Z",
      },
    });

    expect(ui).toEqual({
      rowStatus: "completed",
      storeStatus: "idle",
      stopVisible: false,
      composerEnabled: true,
    });

    finishStream({ assistantMessage: { content: "complete answer" } });
    await expect(stream).resolves.toMatchObject({
      terminal: { status: "completed", assistant: [{ kind: "text", content: "complete answer" }] },
    });
  });

  it("settles the authoritative completed row after a trailing EOF error", async () => {
    const updated = vi.fn();
    const encoder = new TextEncoder();
    let readCount = 0;
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        readCount += 1;
        if (readCount === 1) {
          controller.enqueue(encoder.encode([
            "event: turn.started\n",
            "data: {\"chatId\":\"chat-1\",\"turnId\":\"turn-1\",\"seq\":1}\n\n",
            "event: assistant.text.delta\n",
            "data: {\"chatId\":\"chat-1\",\"turnId\":\"turn-1\",\"seq\":2,\"delta\":\"部分\"}\n\n",
            "event: turn.completed\n",
            "data: {\"chatId\":\"chat-1\",\"turnId\":\"turn-1\",\"seq\":3,\"message\":{\"id\":\"assistant-1\",\"role\":\"assistant\",\"content\":\"完整最终答案\",\"status\":\"completed\",\"createdAt\":\"2026-08-01T09:28:16.000Z\"}}\n\n",
          ].join("")));
          return;
        }
        controller.error(new TypeError("terminated while reading response body"));
      },
    }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
    const outcome = await runConversationStream(
      createLiveTurn("chat-1", "live-request-1", "问题"),
      (callbacks) => consumeStream(response, "chat-1", callbacks),
      updated,
    );

    expect(outcome.recoveredAfterTerminalTransportError).toBe(true);
    expect(outcome.terminal).toMatchObject({
      turnId: "turn-1",
      status: "completed",
      assistant: [{ kind: "text", content: "完整最终答案" }],
    });
    expect(updated).toHaveBeenCalledTimes(3);
  });

  it("still rejects a transport error before any terminal event", async () => {
    await expect(runConversationStream(
      createLiveTurn("chat-1", "live-request-1", "问题"),
      async (callbacks) => {
        callbacks.onConversationEvent?.({ type: "turn.started", chatId: "chat-1", turnId: "turn-1", seq: 1 });
        callbacks.onConversationEvent?.({ type: "assistant.text.delta", chatId: "chat-1", turnId: "turn-1", seq: 2, delta: "部分" });
        throw new TypeError("terminated while reading response body");
      },
      vi.fn(),
    )).rejects.toThrow("terminated while reading response body");
  });

  it("returns the trailing result after a clean EOF", async () => {
    const outcome = await runConversationStream(
      createLiveTurn("chat-1", "live-request-1", "问题"),
      async (callbacks) => {
        callbacks.onConversationEvent?.({ type: "turn.started", chatId: "chat-1", turnId: "turn-1", seq: 1 });
        callbacks.onConversationEvent?.({
          type: "turn.completed",
          chatId: "chat-1",
          turnId: "turn-1",
          seq: 2,
          message: { id: "assistant-1", role: "assistant", content: "完成", status: "completed", createdAt: "2026-08-01T09:28:16.000Z" },
        });
        return { assistantMessage: { id: "assistant-1", content: "完成" }, proposals: [] };
      },
      vi.fn(),
    );

    expect(outcome.recoveredAfterTerminalTransportError).toBe(false);
    expect(outcome.result?.assistantMessage?.content).toBe("完成");
    expect(outcome.terminal?.status).toBe("completed");
  });
});
