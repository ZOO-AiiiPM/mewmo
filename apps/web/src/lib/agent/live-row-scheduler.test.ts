import { afterEach, describe, expect, it, vi } from "vitest";

import { createLiveRowScheduler } from "./live-row-scheduler";
import { applyConversationEvent, createLiveTurn } from "./transcript-adapter";

describe("live transcript row scheduler", () => {
  afterEach(() => vi.useRealTimers());

  it("flushes the latest event state when animation frames are suspended", () => {
    vi.useFakeTimers();
    let turn = createLiveTurn("chat-1", "live-request-1", "问题");
    const projected: Array<{ text: string; status: string }> = [];
    const flush = vi.fn(() => projected.push({
      text: [...turn.blocks].reverse().find((block) => block.kind === "text")?.content ?? "",
      status: turn.terminal?.status ?? "streaming",
    }));
    const requestFrame = vi.fn(() => 1);
    const scheduler = createLiveRowScheduler(flush, { requestFrame });

    turn = applyConversationEvent(turn, { type: "turn.started", chatId: "chat-1", turnId: "turn-1", seq: 1 });
    turn = applyConversationEvent(turn, { type: "assistant.text.delta", chatId: "chat-1", turnId: "turn-1", seq: 2, delta: "完整" });
    scheduler.schedule();
    turn = applyConversationEvent(turn, { type: "assistant.text.delta", chatId: "chat-1", turnId: "turn-1", seq: 3, delta: "答案" });
    turn = applyConversationEvent(turn, {
      type: "turn.completed",
      chatId: "chat-1",
      turnId: "turn-1",
      seq: 4,
      message: { id: "assistant-1", role: "assistant", content: "完整答案", status: "completed", createdAt: "2026-08-01T09:28:16.000Z" },
    });
    scheduler.schedule();

    // A hidden/throttled tab may accept a frame request without running it.
    expect(turn.terminal?.status).toBe("completed");
    expect(projected).toEqual([]);
    vi.advanceTimersByTime(100);

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(projected).toEqual([{ text: "完整答案", status: "completed" }]);
  });

  it("cancels the fallback after a frame flush and cancels both on teardown", () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    let frameCallback: FrameRequestCallback | undefined;
    const cancelFrame = vi.fn();
    const scheduler = createLiveRowScheduler(flush, {
      requestFrame: (callback) => {
        frameCallback = callback;
        return 7;
      },
      cancelFrame,
    });

    scheduler.schedule();
    frameCallback?.(0);
    vi.advanceTimersByTime(250);
    expect(flush).toHaveBeenCalledTimes(1);

    scheduler.schedule();
    scheduler.cancel();
    vi.advanceTimersByTime(250);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledWith(7);
  });

  it("ignores a late frame callback after the fallback already flushed", () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    let frameCallback: FrameRequestCallback | undefined;
    const scheduler = createLiveRowScheduler(flush, {
      requestFrame: (callback) => {
        frameCallback = callback;
        return 1;
      },
    });

    scheduler.schedule();
    vi.advanceTimersByTime(100);
    frameCallback?.(0);

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("does not let a stale cycle callback consume the next scheduled cycle", () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const frameCallbacks: FrameRequestCallback[] = [];
    const scheduler = createLiveRowScheduler(flush, {
      requestFrame: (callback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      },
    });

    scheduler.schedule();
    vi.advanceTimersByTime(100); // Cycle A falls back.
    scheduler.schedule(); // Cycle B is now pending.
    frameCallbacks[0]?.(0); // Stale cycle A callback arrives late.

    expect(flush).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(flush).toHaveBeenCalledTimes(2);
  });
});
