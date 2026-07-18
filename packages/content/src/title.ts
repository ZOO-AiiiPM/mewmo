import { decodeHTMLStrict } from "entities";

const MAX_ENTITY_DECODE_PASSES = 3;

export function normalizeExternalTitle(value: string): string {
  let normalized = stripTitleTags(
    value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"),
  );

  for (let pass = 0; pass < MAX_ENTITY_DECODE_PASSES; pass += 1) {
    const decoded = decodeHTMLStrict(normalized);
    if (decoded === normalized) break;
    normalized = decoded;
  }

  return stripTitleTags(normalized)
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTitleTags(value: string) {
  return value.replace(/<\/?[a-z][^>]*>/gi, " ");
}
