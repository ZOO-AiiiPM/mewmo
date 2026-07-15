import { XMLParser } from "fast-xml-parser";

export interface ParsedFeedEntry {
  title: string;
  url: string;
  content: string;
  summary?: string;
  author?: string;
  publishedAt?: Date;
}

const parser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseTagValue: false,
  processEntities: true,
  textNodeName: "#text",
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object" && "#text" in value) {
    return textValue((value as { "#text"?: unknown })["#text"]);
  }
  return "";
}

function dateValue(value: unknown): Date | undefined {
  const raw = textValue(value);
  if (!raw) {
    return undefined;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function optionalFields(fields: {
  summary?: string | undefined;
  author?: string | undefined;
  publishedAt?: Date | undefined;
}) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

function atomLinkValue(link: unknown): string {
  const links = asArray(link);
  const preferred =
    links.find((item) => typeof item === "object" && item !== null && (item as { rel?: string }).rel === "alternate") ??
    links[0];

  if (typeof preferred === "object" && preferred !== null && "href" in preferred) {
    return textValue((preferred as { href?: unknown }).href);
  }

  return textValue(preferred);
}

export function parseFeedXml(xml: string): ParsedFeedEntry[] {
  const document = parser.parse(xml) as {
    rss?: { channel?: { item?: unknown } };
    feed?: { entry?: unknown };
  };

  if (document.rss?.channel?.item) {
    return asArray(document.rss.channel.item)
      .map((item) => {
        const rssItem = item as Record<string, unknown>;
        const summary = textValue(rssItem.description) || undefined;
        const author = textValue(rssItem.author) || textValue(rssItem["dc:creator"]) || undefined;
        const publishedAt = dateValue(rssItem.pubDate);
        return {
          title: textValue(rssItem.title),
          url: textValue(rssItem.link),
          content: textValue(rssItem["content:encoded"]) || textValue(rssItem.description),
          ...optionalFields({ summary, author, publishedAt }),
        };
      })
      .filter((entry) => entry.title && entry.url);
  }

  if (document.feed?.entry) {
    return asArray(document.feed.entry)
      .map((item) => {
        const atomEntry = item as Record<string, unknown>;
        const summary = textValue(atomEntry.summary) || undefined;
        const author = textValue((atomEntry.author as { name?: unknown } | undefined)?.name) || undefined;
        const publishedAt = dateValue(atomEntry.published) ?? dateValue(atomEntry.updated);
        return {
          title: textValue(atomEntry.title),
          url: atomLinkValue(atomEntry.link),
          content: textValue(atomEntry.content) || textValue(atomEntry.summary),
          ...optionalFields({ summary, author, publishedAt }),
        };
      })
      .filter((entry) => entry.title && entry.url);
  }

  return [];
}
