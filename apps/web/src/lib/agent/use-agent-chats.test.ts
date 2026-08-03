import { readFileSync } from "node:fs";
import { createElement, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./conversation-store", () => ({
  useConversationStore: () => ({ status: "idle", stableRows: [], liveRow: null }),
}));

import { useAgentChats } from "./use-agent-chats";

function LoadingButton() {
  const chats = useAgentChats();
  return createElement("button", { disabled: chats.loadingChats }, "new chat");
}

describe("useAgentChats hydration boundary", () => {
  it("renders the same enabled first frame on the server and hydration client", () => {
    const serverHtml = renderToString(createElement(StrictMode, null, createElement(LoadingButton)));
    const hydrationHtml = renderToString(createElement(StrictMode, null, createElement(LoadingButton)));

    expect(serverHtml).toBe("<button>new chat</button>");
    expect(hydrationHtml).toBe(serverHtml);
  });

  it("defers the fetch so Strict Mode cleanup can cancel its probe pass", () => {
    const source = readFileSync("apps/web/src/lib/agent/use-agent-chats.ts", "utf8");

    expect(source).toContain("const timer = window.setTimeout");
    expect(source).toContain("window.clearTimeout(timer)");
    expect(source.indexOf("setLoadingChats(true)")).toBeLessThan(source.indexOf("window.setTimeout"));
  });
});
