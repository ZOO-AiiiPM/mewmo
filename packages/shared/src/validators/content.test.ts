import { describe, expect, it } from "vitest";

import {
  createClipSchema,
  createFeedSchema,
  createNoteSchema,
  updateNoteSchema,
} from "./content";

describe("content validators", () => {
  it("accepts valid note input", () => {
    const note = createNoteSchema.parse({
      slug: "hello",
      title: "Hello",
      content: "Body",
    });

    expect(note.title).toBe("Hello");
  });

  it("requires valid feed urls", () => {
    expect(() => createFeedSchema.parse({ url: "not-a-url", title: "Bad" })).toThrow();
  });

  it("requires update notes to include at least one mutable field", () => {
    expect(() => updateNoteSchema.parse({})).toThrow();
  });

  it("accepts clips with optional metadata", () => {
    const clip = createClipSchema.parse({
      url: "https://example.com/a",
      title: "A",
      content: "",
    });

    expect(clip.url).toContain("https://");
  });
});
