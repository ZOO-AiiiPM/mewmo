import { describe, expect, it } from "vitest";

import {
  FILTERED_VALUE,
  createSentryOptions,
  scrubSentryEvent,
  stripUrlDetails,
} from "../../apps/web/src/lib/observability/sentry";

describe("Sentry privacy filtering", () => {
  it("removes nested credentials and user content without mutating the event", () => {
    const event = {
      event_id: "event-1",
      message: "Failed to save note",
      request: {
        method: "POST",
        url: "https://mewmo.example/api/notes?shareToken=private#editor",
        headers: {
          authorization: "Bearer private",
          Cookie: "session=private",
          "content-type": "application/json",
        },
        data: {
          title: "Private title",
          body: "Private note body",
        },
      },
      extra: {
        route: "/api/notes",
        password: "private",
        apiKey: "private",
        nested: {
          prompt: "Private prompt",
          messages: [{ role: "user", content: "Private message" }],
          toolCall: {
            name: "searchNotes",
            arguments: { query: "Private query" },
            result: "Private result",
          },
        },
      },
      breadcrumbs: [
        {
          category: "navigation",
          data: { from: "/today?day=private", to: "/notes#private" },
        },
      ],
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed).toEqual({
      event_id: "event-1",
      message: "Failed to save note",
      request: {
        method: "POST",
        url: "https://mewmo.example/api/notes",
        headers: {
          authorization: FILTERED_VALUE,
          Cookie: FILTERED_VALUE,
          "content-type": "application/json",
        },
        data: FILTERED_VALUE,
      },
      extra: {
        route: "/api/notes",
        password: FILTERED_VALUE,
        apiKey: FILTERED_VALUE,
        nested: {
          prompt: FILTERED_VALUE,
          messages: FILTERED_VALUE,
          toolCall: {
            name: "searchNotes",
            arguments: FILTERED_VALUE,
            result: FILTERED_VALUE,
          },
        },
      },
      breadcrumbs: [
        {
          category: "navigation",
          data: { from: "/today", to: "/notes" },
        },
      ],
    });
    expect(event.request.headers.authorization).toBe("Bearer private");
    expect(event.extra.nested.prompt).toBe("Private prompt");
  });

  it("strips query, hash, and embedded credentials from URLs", () => {
    expect(
      stripUrlDetails("https://user:pass@mewmo.example/path?q=private#section"),
    ).toBe("https://mewmo.example/path");
    expect(stripUrlDetails("/notes/note-1?share=private#heading")).toBe(
      "/notes/note-1",
    );
  });

  it("stays disabled without a DSN and closes optional data collection", () => {
    expect(createSentryOptions({})).toBeNull();

    const options = createSentryOptions({
      dsn: "https://public@example.invalid/1",
      environment: "preview",
      release: "commit-1",
    });

    expect(options).toMatchObject({
      enabled: true,
      environment: "preview",
      release: "commit-1",
      sendDefaultPii: false,
      enableLogs: false,
      tracesSampleRate: 0.05,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: false, response: false },
        httpBodies: [],
        urlQueryParams: false,
        genAI: { inputs: false, outputs: false },
      },
    });
  });
});
