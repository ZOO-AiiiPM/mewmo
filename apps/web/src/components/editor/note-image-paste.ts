import { Fragment, Slice, type Node as ProseMirrorNode, type Schema } from "@milkdown/kit/prose/model";

interface SliceNodeJson {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: SliceNodeJson[];
  text?: string;
}

interface SliceJson {
  content?: SliceNodeJson[];
  openStart?: number;
  openEnd?: number;
}

function imageBlockAttrs(attrs: Record<string, unknown> = {}) {
  const parsedRatio = Number(attrs.alt ?? attrs.ratio ?? 1);
  return {
    src: typeof attrs.src === "string" ? attrs.src : "",
    caption:
      typeof attrs.title === "string"
        ? attrs.title
        : typeof attrs.caption === "string"
          ? attrs.caption
          : "",
    ratio: Number.isFinite(parsedRatio) && parsedRatio > 0 ? parsedRatio : 1,
  };
}

function standaloneImage(node: SliceNodeJson) {
  if (node.type === "image") return node;
  if (node.type !== "paragraph" || node.content?.length !== 1) return null;
  const image = node.content[0];
  return image?.type === "image" ? image : null;
}

export function normalizePastedImageSliceJson<T extends SliceJson>(slice: T): T {
  let changed = false;
  const content = slice.content?.map((node) => {
    const image = standaloneImage(node);
    if (!image) return node;
    changed = true;
    return { type: "image-block", attrs: imageBlockAttrs(image.attrs) };
  });

  if (!changed) return slice;
  return { ...slice, content, openStart: 0, openEnd: 0 };
}

export function normalizePastedImageSlice(slice: Slice, schema: Schema) {
  const imageBlock = schema.nodes["image-block"];
  if (!imageBlock) return slice;

  let changed = false;
  const nodes: ProseMirrorNode[] = [];
  slice.content.forEach((node) => {
    const image =
      node.type.name === "image"
        ? node
        : node.type.name === "paragraph" && node.childCount === 1 && node.firstChild?.type.name === "image"
          ? node.firstChild
          : null;
    if (!image) {
      nodes.push(node);
      return;
    }

    changed = true;
    nodes.push(imageBlock.create(imageBlockAttrs(image.attrs)));
  });

  return changed ? new Slice(Fragment.fromArray(nodes), 0, 0) : slice;
}
