import { describe, expect, it } from "vitest";

import {
  getRememberedFeedTypeHref,
  getRememberedKnowledgeBaseHref,
  getRememberedWorkspaceHref,
  getRememberedWorkspaceSelection,
  getWorkspaceScroll,
  rememberWorkspaceRoute,
  rememberWorkspaceScroll,
  rememberWorkspaceSelection,
  scrollTopForWorkspaceMemory,
  shouldRestoreWorkspaceListScroll,
  workspaceSectionFromPath,
  type StorageLike,
} from "../../apps/web/src/lib/workspace-memory";

function createStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe("workspace memory", () => {
  it("maps workspace routes to their persistent section", () => {
    expect(workspaceSectionFromPath("/today")).toBe("today");
    expect(workspaceSectionFromPath("/notes")).toBe("notes");
    expect(workspaceSectionFromPath("/notes/weekly")).toBe("notes");
    expect(workspaceSectionFromPath("/clips/c1")).toBe("clips");
    expect(workspaceSectionFromPath("/feeds")).toBe("feeds");
    expect(workspaceSectionFromPath("/feed-entries/e1")).toBe("feeds");
    expect(workspaceSectionFromPath("/knowledge-bases")).toBe("knowledge-bases");
    expect(workspaceSectionFromPath("/settings")).toBeNull();
  });

  it("remembers the last href for each top-level workspace section", () => {
    const storage = createStorage();

    rememberWorkspaceRoute("/notes/weekly", "", storage);
    rememberWorkspaceRoute("/clips/c1", "", storage);

    expect(getRememberedWorkspaceHref("notes", "/notes", storage)).toBe("/notes/weekly");
    expect(getRememberedWorkspaceHref("clips", "/clips", storage)).toBe("/clips/c1");
    expect(getRememberedWorkspaceHref("today", "/today", storage)).toBe("/today");
  });

  it("remembers feed routes per feed type", () => {
    const storage = createStorage();

    rememberWorkspaceRoute("/feeds", "?type=media&feedId=f1&entryId=e1", storage);

    expect(getRememberedWorkspaceHref("feeds", "/feeds?type=article", storage)).toBe(
      "/feeds?type=media&feedId=f1&entryId=e1",
    );
    expect(getRememberedFeedTypeHref("media", "/feeds?type=media", storage)).toBe(
      "/feeds?type=media&feedId=f1&entryId=e1",
    );
    expect(getRememberedFeedTypeHref("article", "/feeds?type=article", storage)).toBe(
      "/feeds?type=article",
    );
  });

  it("remembers knowledge routes per knowledge base", () => {
    const storage = createStorage();

    rememberWorkspaceRoute("/knowledge-bases", "?kbId=kb1&folderId=f1&itemId=i1", storage);

    expect(getRememberedKnowledgeBaseHref("kb1", "/knowledge-bases?kbId=kb1", storage)).toBe(
      "/knowledge-bases?kbId=kb1&folderId=f1&itemId=i1",
    );
    expect(getRememberedKnowledgeBaseHref("kb2", "/knowledge-bases?kbId=kb2", storage)).toBe(
      "/knowledge-bases?kbId=kb2",
    );
  });

  it("restores list scroll across the section and reader scroll only for the same href", () => {
    const storage = createStorage();

    rememberWorkspaceScroll(
      "notes",
      "/notes/weekly",
      { listScrollTop: 420, readerScrollTop: 85 },
      storage,
    );

    expect(getWorkspaceScroll("notes", "/notes/weekly", storage)).toEqual({
      listScrollTop: 420,
      readerScrollTop: 85,
    });
    expect(getWorkspaceScroll("notes", "/notes/different", storage)).toEqual({
      listScrollTop: 420,
      readerScrollTop: undefined,
    });
  });

  it("stores local selection for sections without item routes", () => {
    const storage = createStorage();

    rememberWorkspaceSelection("today", "clip-c1", storage);

    expect(getRememberedWorkspaceSelection("today", storage)).toBe("clip-c1");
  });

  it("does not restore list scroll during same-section item navigation", () => {
    expect(
      shouldRestoreWorkspaceListScroll({
        previousHref: null,
        href: "/notes/first",
      }),
    ).toBe(true);
    expect(
      shouldRestoreWorkspaceListScroll({
        previousHref: "/notes/first",
        href: "/notes/second",
      }),
    ).toBe(false);
    expect(
      shouldRestoreWorkspaceListScroll({
        previousHref: "/notes/second",
        href: "/notes/second",
      }),
    ).toBe(true);
  });

  it("does not overwrite remembered scroll with an unscrollable loading shell", () => {
    expect(scrollTopForWorkspaceMemory(null)).toBeUndefined();
    expect(
      scrollTopForWorkspaceMemory({
        scrollTop: 0,
        scrollHeight: 320,
        clientHeight: 320,
      }),
    ).toBeUndefined();
    expect(
      scrollTopForWorkspaceMemory({
        scrollTop: 0,
        scrollHeight: 1200,
        clientHeight: 320,
      }),
    ).toBe(0);
    expect(
      scrollTopForWorkspaceMemory({
        scrollTop: 420,
        scrollHeight: 1200,
        clientHeight: 320,
      }),
    ).toBe(420);
  });
});
