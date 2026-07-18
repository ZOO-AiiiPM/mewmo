import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  queueNoteDraftSync,
  subscribeNoteDraftSync,
} from "../../apps/web/src/components/editor/note-draft-sync";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: new MemoryStorage() });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("note draft sync", () => {
  it("reports saving then saved and sends optimistic version", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: 5 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const states: string[] = [];
    subscribeNoteDraftSync("u1", "n1", (state) => states.push(state.status));

    queueNoteDraftSync({ userId: "u1", noteId: "n1", title: "T", content: "B", serverVersion: 4, updatedAt: 1 });
    await vi.runAllTimersAsync();

    expect(states).toContain("saving");
    expect(states.at(-1)).toBe("saved");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"expectedVersion":4');
  });

  it("keeps a network-failed draft and reports offline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const states: string[] = [];
    subscribeNoteDraftSync("u2", "n2", (state) => states.push(state.status));
    queueNoteDraftSync({ userId: "u2", noteId: "n2", title: "T", content: "B", serverVersion: 1, updatedAt: 2 });
    await vi.advanceTimersByTimeAsync(900);
    expect(states.at(-1)).toBe("offline");
  });

  it("reports HTTP conflicts as save errors", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 409 })));
    const states: string[] = [];
    subscribeNoteDraftSync("u3", "n3", (state) => states.push(state.status));
    queueNoteDraftSync({ userId: "u3", noteId: "n3", title: "T", content: "B", serverVersion: 1, updatedAt: 3 });
    await vi.runAllTimersAsync();
    expect(states.at(-1)).toBe("error");
  });
});
