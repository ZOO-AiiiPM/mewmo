export interface NoteTocItem {
  id: string;
  level: 1 | 2 | 3;
  title: string;
}

export function buildNoteToc(content: string, maxItems = 16): NoteTocItem[] {
  const items: NoteTocItem[] = [];
  let inFence = false;

  for (const line of content.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (!match) continue;

    const rawTitle = match[2] ?? "";
    const title = cleanHeadingTitle(rawTitle);
    if (!title) continue;

    items.push({
      id: `heading-${items.length}`,
      level: match[1]?.length as 1 | 2 | 3,
      title,
    });

    if (items.length >= maxItems) break;
  }

  return items;
}

export function buildHtmlToc(content: string, maxItems = 16): NoteTocItem[] {
  const items: NoteTocItem[] = [];
  const body = content
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, "")
    .replace(/<code\b[\s\S]*?<\/code>/gi, "");
  const headingPattern = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;

  for (const match of body.matchAll(headingPattern)) {
    const level = Number.parseInt(match[1] ?? "1", 10) as 1 | 2 | 3;
    const title = cleanHtmlHeadingTitle(match[2] ?? "");
    if (!title) continue;

    items.push({
      id: `heading-${items.length}`,
      level,
      title,
    });

    if (items.length >= maxItems) break;
  }

  return items;
}

export function tocScrollTopForHeading({
  containerTop,
  headingTop,
  maxScrollTop,
  scrollTop,
  topOffset,
}: {
  containerTop: number;
  headingTop: number;
  maxScrollTop: number;
  scrollTop: number;
  topOffset: number;
}) {
  const nextTop = scrollTop + headingTop - containerTop - topOffset;
  return Math.min(Math.max(0, Math.round(nextTop)), Math.max(0, maxScrollTop));
}

export function activeTocIndexFromHeadingTops({
  containerTop,
  headingTops,
  topOffset,
}: {
  containerTop: number;
  headingTops: number[];
  topOffset: number;
}) {
  const marker = containerTop + topOffset + 1;
  return headingTops.reduce((current, headingTop, index) => {
    return headingTop <= marker ? index : current;
  }, 0);
}

function cleanHeadingTitle(value: string) {
  return value
    .replace(/\s+#+\s*$/, "")
    .replace(/[*_`~]/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .trim();
}

function cleanHtmlHeadingTitle(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => {
      const point = Number.parseInt(code, 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => {
      const point = Number.parseInt(code, 16);
      return Number.isFinite(point) ? String.fromCodePoint(point) : "";
    });
}
