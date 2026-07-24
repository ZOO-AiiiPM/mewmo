import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  queueNoteDraftSync,
  resolveNoteDraftConflict,
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
  it("reports saving only when the request starts, then saved with the new version", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "n1",
      title: "T",
      content: "B",
      version: 5,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const states: string[] = [];
    subscribeNoteDraftSync("u1", "n1", (state) => states.push(state.status));

    queueNoteDraftSync({
      userId: "u1",
      noteId: "n1",
      title: "T",
      content: "B",
      serverVersion: 4,
      baseTitle: "T",
      baseContent: "A",
      updatedAt: 1,
    });
    expect(states).toEqual(["saved"]);
    await vi.runAllTimersAsync();

    expect(states).toEqual(["saved", "saving", "saved"]);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"expectedVersion":4');
  });

  it("serializes a newer draft behind an in-flight save and advances its version", async () => {
    vi.useFakeTimers();
    let resolveFirst: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "n2",
        title: "T2",
        content: "B2",
        version: 6,
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    queueNoteDraftSync({
      userId: "u2", noteId: "n2", title: "T1", content: "B1", serverVersion: 4,
      baseTitle: "T", baseContent: "B", updatedAt: 1,
    }, 0);
    await vi.advanceTimersByTimeAsync(0);
    queueNoteDraftSync({
      userId: "u2", noteId: "n2", title: "T2", content: "B2", serverVersion: 4,
      baseTitle: "T", baseContent: "B", updatedAt: 2,
    }, 0);

    resolveFirst?.(new Response(JSON.stringify({
      id: "n2", title: "T1", content: "B1", version: 5,
    }), { status: 200 }));
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toContain('"expectedVersion":5');
  });

  it("automatically rebases a conflict when the remote body still matches the draft base", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ currentVersion: 5 }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "n3", title: "T", content: "B", version: 5,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "n3", title: "T-new", content: "B-new", version: 6,
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const states: string[] = [];
    subscribeNoteDraftSync("u3", "n3", (state) => states.push(state.status));

    queueNoteDraftSync({
      userId: "u3", noteId: "n3", title: "T-new", content: "B-new", serverVersion: 4,
      baseTitle: "T", baseContent: "B", updatedAt: 3,
    }, 0);
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[1]?.body).toContain('"expectedVersion":5');
    expect(states).not.toContain("conflict");
  });

  it("uses the newest local draft when typing continues during conflict recovery", async () => {
    vi.useFakeTimers();
    let resolveRemote: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ currentVersion: 5 }), { status: 409 }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveRemote = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const snapshots: Array<{ status: string; conflict?: { localContent: string } }> = [];
    subscribeNoteDraftSync("u7", "n7", (state) => snapshots.push(state));

    queueNoteDraftSync({
      userId: "u7", noteId: "n7", title: "Local", content: "First local body", serverVersion: 4,
      baseTitle: "Base", baseContent: "Base body", updatedAt: 7,
    }, 0);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    queueNoteDraftSync({
      userId: "u7", noteId: "n7", title: "Local newer", content: "Newest local body", serverVersion: 4,
      baseTitle: "Base", baseContent: "Base body", updatedAt: 8,
    }, 0);
    resolveRemote?.(new Response(JSON.stringify({
      id: "n7", title: "Remote", content: "Remote body", version: 5,
    }), { status: 200 }));
    await vi.runAllTimersAsync();

    expect(snapshots.at(-1)).toMatchObject({
      status: "conflict",
      conflict: { localContent: "Newest local body" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a real conflict local and lets the user choose the local version", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ currentVersion: 5 }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "n4", title: "Remote", content: "Remote body", version: 5,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "n4", title: "Local", content: "Local body", version: 6,
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const states: string[] = [];
    subscribeNoteDraftSync("u4", "n4", (state) => states.push(state.status));

    queueNoteDraftSync({
      userId: "u4", noteId: "n4", title: "Local", content: "Local body", serverVersion: 4,
      baseTitle: "Base", baseContent: "Base body", updatedAt: 4,
    }, 0);
    await vi.runAllTimersAsync();

    expect(states.at(-1)).toBe("conflict");
    queueNoteDraftSync({
      userId: "u4", noteId: "n4", title: "Local newer", content: "Local body newer", serverVersion: 4,
      baseTitle: "Base", baseContent: "Base body", updatedAt: 5,
    }, 0);
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resolveNoteDraftConflict("u4", "n4", "local")).toBe(true);
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[1]?.body).toContain('"expectedVersion":5');
    expect(fetchMock.mock.calls[2]?.[1]?.body).toContain("Local body newer");
  });

  it("adopts the remote note when the user chooses the cloud version", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ currentVersion: 8 }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "n6", title: "Remote", content: "Remote body", version: 8,
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const snapshots: Array<{ status: string; content?: string; resolvedWithRemote?: boolean }> = [];
    subscribeNoteDraftSync("u6", "n6", (state) => snapshots.push(state));

    queueNoteDraftSync({
      userId: "u6", noteId: "n6", title: "Local", content: "Local body", serverVersion: 7,
      baseTitle: "Base", baseContent: "Base body", updatedAt: 6,
    }, 0);
    await vi.runAllTimersAsync();
    expect(resolveNoteDraftConflict("u6", "n6", "remote")).toBe(true);

    expect(snapshots.at(-1)).toMatchObject({
      status: "saved",
      content: "Remote body",
      resolvedWithRemote: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a network-failed draft and reports offline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const states: string[] = [];
    subscribeNoteDraftSync("u5", "n5", (state) => states.push(state.status));
    queueNoteDraftSync({ userId: "u5", noteId: "n5", title: "T", content: "B", serverVersion: 1, updatedAt: 5 });
    await vi.advanceTimersByTimeAsync(900);
    expect(states.at(-1)).toBe("offline");
  });
});
