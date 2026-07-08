import { describe, expect, it, vi } from "vitest";

import {
  buildNoteImageObjectPath,
  extensionForImageType,
  uploadNoteImageFile,
} from "../../apps/web/src/lib/note-image-upload";

describe("note image upload helpers", () => {
  it("uses stable note-scoped paths with safe image extensions", () => {
    expect(
      buildNoteImageObjectPath({
        noteId: "note_123",
        contentType: "image/png",
        now: new Date("2026-07-07T08:09:10.000Z"),
        randomId: "abcDEF123",
      }),
    ).toBe("notes/note_123/2026/07/07/080910-abcDEF123.png");
  });

  it("maps supported image content types to extensions", () => {
    expect(extensionForImageType("image/png")).toBe("png");
    expect(extensionForImageType("image/jpeg")).toBe("jpg");
    expect(extensionForImageType("image/webp")).toBe("webp");
    expect(extensionForImageType("image/gif")).toBe("gif");
  });

  it("rejects non-image uploads", async () => {
    await expect(
      uploadNoteImageFile({
        noteId: "note-1",
        file: new File(["not image"], "note.txt", { type: "text/plain" }),
        upload: vi.fn(),
      }),
    ).rejects.toThrow("Unsupported image type");
  });

  it("uploads accepted images and returns a permanent url", async () => {
    const upload = vi.fn().mockResolvedValue({
      path: "notes/note-1/2026/07/07/080910-rand.png",
      url: "https://cdn.mewmo.test/notes/note-1/2026/07/07/080910-rand.png",
    });

    await expect(
      uploadNoteImageFile({
        noteId: "note-1",
        file: new File([new Uint8Array([1, 2, 3])], "pasted.png", {
          type: "image/png",
        }),
        upload,
        now: new Date("2026-07-07T08:09:10.000Z"),
        randomId: () => "rand",
      }),
    ).resolves.toEqual({
      path: "notes/note-1/2026/07/07/080910-rand.png",
      url: "https://cdn.mewmo.test/notes/note-1/2026/07/07/080910-rand.png",
    });

    expect(upload).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "notes/note-1/2026/07/07/080910-rand.png",
      "image/png",
    );
  });
});
