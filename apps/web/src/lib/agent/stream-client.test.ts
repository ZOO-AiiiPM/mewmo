import { describe, expect, it, vi } from "vitest";

import { consumeStream, parseSseFrame } from "./stream-client";

describe("agent SSE client", () => {
  it("parses valid frames and ignores malformed JSON", () => {
    expect(parseSseFrame("event: text_delta\ndata: {\"delta\":\"你\"}")).toEqual({ eventType: "text_delta", data: { delta: "你" } });
    expect(parseSseFrame("event: text_delta\ndata: nope")).toBeNull();
  });

  it("processes an unterminated tail frame and filters another chat", async () => {
    const onConversationEvent = vi.fn();
    const response = new Response([
      "event: assistant.text.delta\n",
      "data: {\"chatId\":\"chat-2\",\"turnId\":\"turn-1\",\"seq\":1,\"delta\":\"丢弃\"}\n\n",
      "event: assistant.text.delta\n",
      "data: {\"chatId\":\"chat-1\",\"turnId\":\"turn-1\",\"seq\":2,\"delta\":\"保留\"}",
    ].join(""), { headers: { "Content-Type": "text/event-stream" } });

    await consumeStream(response, "chat-1", { onConversationEvent });

    expect(onConversationEvent).toHaveBeenCalledTimes(1);
    expect(onConversationEvent).toHaveBeenCalledWith(expect.objectContaining({ delta: "保留", seq: 2 }));
  });

  it("uses the shared stable-event contract, including positive seq", async () => {
    const onConversationEvent = vi.fn();
    const response = new Response([
      "event: turn.started\n",
      "data: {\"chatId\":\"chat-1\",\"turnId\":\"turn-1\",\"seq\":0}\n\n",
      "event: turn.started\n",
      "data: {\"chatId\":\"chat-1\",\"turnId\":\"turn-1\",\"seq\":1}\n\n",
    ].join(""), { headers: { "Content-Type": "text/event-stream" } });

    await consumeStream(response, "chat-1", { onConversationEvent });

    expect(onConversationEvent).toHaveBeenCalledTimes(1);
    expect(onConversationEvent).toHaveBeenCalledWith(expect.objectContaining({ seq: 1 }));
  });

  it("validates result and error payloads before exposing them", async () => {
    const onResult = vi.fn();
    const onError = vi.fn();
    const response = new Response([
      "event: result\ndata: {\"assistantMessage\":{\"content\":42}}\n\n",
      "event: error\ndata: {\"error\":{\"message\":42}}\n\n",
      "event: result\ndata: {\"assistantMessage\":{\"content\":\"完成\"}}\n\n",
    ].join(""), { headers: { "Content-Type": "text/event-stream" } });

    const result = await consumeStream(response, "chat-1", { onResult, onError });

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith({ assistantMessage: { content: "完成" } });
    expect(onError).toHaveBeenCalledWith({ message: "Agent 请求失败" });
    expect(result).toEqual({ assistantMessage: { content: "完成" } });
  });

  it("handles frame boundaries across chunks and supports abort", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: text_delta\ndata: {\"del"));
        controller.enqueue(encoder.encode("ta\":\"分块\"}\n\nevent: result\ndata: {}\n\n"));
        controller.close();
      },
    });
    const onLegacyEvent = vi.fn();

    await expect(consumeStream(new Response(stream), "chat-1", { onLegacyEvent })).resolves.toEqual({});
    expect(onLegacyEvent).toHaveBeenCalledWith({ type: "text_delta", delta: "分块" });

    const abortController = new AbortController();
    abortController.abort();
    await expect(consumeStream(new Response("event: text_delta\ndata: {\"delta\":\"忽略\"}\n\n"), "chat-1", { onLegacyEvent }, abortController.signal)).resolves.toBeNull();
    expect(onLegacyEvent).toHaveBeenCalledTimes(1);
  });
});
