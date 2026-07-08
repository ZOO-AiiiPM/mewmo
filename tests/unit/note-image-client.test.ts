import { beforeEach, describe, expect, it, vi } from "vitest";

import { uploadNoteImage } from "../../apps/web/src/components/editor/note-image-client";

describe("note image client upload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts image files as multipart form data and returns the permanent url", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://cdn.mewmo.test/notes/note-1/image.png" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadNoteImage(
        "note-1",
        new File([new Uint8Array([1, 2, 3])], "pasted.png", {
          type: "image/png",
        }),
      ),
    ).resolves.toBe("https://cdn.mewmo.test/notes/note-1/image.png");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/uploads/note-image",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
  });

  it("throws when the upload endpoint rejects the image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Unsupported image type" }),
      }),
    );

    await expect(
      uploadNoteImage(
        "note-1",
        new File(["x"], "note.txt", { type: "text/plain" }),
      ),
    ).rejects.toThrow("Unsupported image type");
  });
});
