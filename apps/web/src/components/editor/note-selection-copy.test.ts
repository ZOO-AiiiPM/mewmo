import { Fragment, Schema, Slice } from "@milkdown/kit/prose/model";
import { describe, expect, it } from "vitest";

import { serializeNoteSelectionText } from "./note-selection-copy";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    heading: { group: "block", content: "inline*" },
    text: { group: "inline" },
    hardbreak: {
      group: "inline",
      inline: true,
      leafText: () => "\n",
    },
    html: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: { value: { default: "" } },
    },
    image: {
      group: "inline",
      inline: true,
      atom: true,
      attrs: { alt: { default: "" } },
    },
    horizontal_rule: { group: "block", atom: true },
  },
  marks: { strong: {} },
});

function slice(...nodes: Parameters<typeof Fragment.fromArray>[0]) {
  return new Slice(Fragment.fromArray(nodes), 0, 0);
}

describe("note selection plain-text serializer", () => {
  it("copies heading and emphasized content without markdown markers", () => {
    const strong = schema.marks.strong!.create();
    expect(
      serializeNoteSelectionText(
        slice(
          schema.nodes.heading!.create(null, schema.text("标题")),
          schema.nodes.paragraph!.create(null, [
            schema.text("这是"),
            schema.text("重点", [strong]),
          ]),
        ),
      ),
    ).toBe("标题\n\n这是重点");
  });

  it("keeps real breaks while suppressing raw html source", () => {
    expect(
      serializeNoteSelectionText(
        slice(
          schema.nodes.paragraph!.create(null, [
            schema.text("第一行"),
            schema.nodes.hardbreak!.create(),
            schema.text("第二行"),
            schema.nodes.html!.create({ value: "<br />" }),
            schema.text("第三行"),
            schema.nodes.html!.create({ value: "<mark>raw</mark>" }),
          ]),
        ),
      ),
    ).toBe("第一行\n第二行\n第三行");
  });

  it("returns a truthy blank for selections with no visible text", () => {
    const rawHtmlOnly = serializeNoteSelectionText(
      slice(schema.nodes.html!.create({ value: "<mark>raw</mark>" })),
    );
    const nonTextAtoms = serializeNoteSelectionText(
      slice(
        schema.nodes.paragraph!.create(null, [
          schema.nodes.image!.create({ alt: "封面" }),
        ]),
        schema.nodes.horizontal_rule!.create(),
      ),
    );

    expect(rawHtmlOnly).not.toBe("");
    expect(nonTextAtoms).not.toBe("");
    expect(rawHtmlOnly).not.toContain("raw");
    expect(nonTextAtoms).not.toMatch(/!\[|---/);
  });
});
