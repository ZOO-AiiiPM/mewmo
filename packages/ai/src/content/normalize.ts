export function htmlToSummaryMarkdown(input: string) {
  const source = input.trim();
  if (!source) return "";
  if (!/<[a-zA-Z][\w:-]*(?:\s|>|\/>)/.test(source)) {
    return normalizeMarkdownText(decodeHtmlEntities(source));
  }

  let markdown = source
    .replace(/<!--[\s\S]*?-->|<!doctype[^>]*>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
    .replace(/<math\b[\s\S]*?<\/math>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/<img\b[^>]*>/gi, "");

  markdown = replaceBlock(markdown, "blockquote", (inner) => {
    const quote = htmlToSummaryMarkdown(inner)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `> ${line}`)
      .join("\n");
    return quote ? `\n\n${quote}\n\n` : "\n\n";
  });

  markdown = markdown.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level: string, inner: string) => {
    const text = inlineHtmlToText(inner);
    if (!text) return "\n\n";
    return `\n\n${"#".repeat(Number(level))} ${text}\n\n`;
  });

  markdown = markdown.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_match, inner: string) => {
    const text = inlineHtmlToText(inner);
    return text ? `\n- ${text}\n` : "\n";
  });

  markdown = markdown
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n\n---\n\n")
    .replace(/<\/(?:ul|ol)>/gi, "\n")
    .replace(/<t[dh]\b[^>]*>/gi, " ")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|main|header|footer|table|thead|tbody|pre)>/gi, "\n\n")
    .replace(/<(?:p|div|section|article|main|header|footer|table|thead|tbody|pre|ul|ol|tr)\b[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");

  return normalizeMarkdownText(decodeHtmlEntities(markdown));
}

function replaceBlock(source: string, tag: string, replacer: (inner: string) => string) {
  return source.replace(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"), (_match, inner: string) =>
    replacer(inner),
  );
}

function inlineHtmlToText(html: string) {
  return normalizeInlineText(
    decodeHtmlEntities(
      html
        .replace(/<script\b[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[\s\S]*?<\/style>/gi, "")
        .replace(/<img\b[^>]*>/gi, "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, ""),
    ),
  );
}

function normalizeMarkdownText(value: string) {
  return value
    .split("\n")
    .map((line) => normalizeInlineText(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeInlineText(value: string) {
  return value
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, "$1$2")
    .replace(/\s+([，。！？；：、）】》])/g, "$1")
    .replace(/([（【《])\s+/g, "$1")
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body: string) => {
    const name = body.toLowerCase();
    if (name.startsWith("#x")) {
      const codePoint = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    if (name.startsWith("#")) {
      const codePoint = Number.parseInt(name.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return HTML_ENTITIES[name] ?? entity;
  });
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "...",
  ldquo: '"',
  lsquo: "'",
  mdash: "-",
  nbsp: " ",
  ndash: "-",
  quot: '"',
  rdquo: '"',
  rsquo: "'",
  lt: "<",
};
