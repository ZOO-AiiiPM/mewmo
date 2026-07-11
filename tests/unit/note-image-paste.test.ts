import { describe, expect, it } from "vitest";

import { normalizePastedImageSliceJson } from "../../apps/web/src/components/editor/note-image-paste";

describe("note image paste", () => {
  it("promotes a copied standalone markdown image to a resizable Crepe image block", () => {
    expect(
      normalizePastedImageSliceJson({
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "image",
                attrs: {
                  src: "https://cdn.example.com/note.png",
                  title: "caption",
                  alt: "0.75",
                },
              },
            ],
          },
        ],
        openStart: 0,
        openEnd: 0,
      }),
    ).toEqual({
      content: [
        {
          type: "image-block",
          attrs: {
            src: "https://cdn.example.com/note.png",
            caption: "caption",
            ratio: 0.75,
          },
        },
      ],
      openStart: 0,
      openEnd: 0,
    });
  });

  it("does not promote an inline image mixed with text", () => {
    const slice = {
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "before" },
            { type: "image", attrs: { src: "https://cdn.example.com/inline.png" } },
          ],
        },
      ],
    };

    expect(normalizePastedImageSliceJson(slice)).toEqual(slice);
  });

  it("promotes a directly copied image node from browser clipboard HTML", () => {
    expect(
      normalizePastedImageSliceJson({
        content: [
          {
            type: "image",
            attrs: {
              src: "https://cdn.example.com/direct.png",
              title: "direct caption",
              alt: "0.5",
            },
          },
        ],
        openStart: 0,
        openEnd: 0,
      }),
    ).toEqual({
      content: [
        {
          type: "image-block",
          attrs: {
            src: "https://cdn.example.com/direct.png",
            caption: "direct caption",
            ratio: 0.5,
          },
        },
      ],
      openStart: 0,
      openEnd: 0,
    });
  });
});
