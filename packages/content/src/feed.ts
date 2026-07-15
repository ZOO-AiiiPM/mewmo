import { XMLParser } from "fast-xml-parser";

export interface ParsedFeedEntry {
  title: string;
  url: string;
  content: string;
  excerpt?: string;
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

const DEFAULT_FEED_FETCH_TIMEOUT_MS = 15_000;

interface FetchFeedDocumentOptions {
  fetchFeed?: typeof fetch;
  timeoutMs?: number;
}

export async function fetchFeedDocument(
  url: string,
  options: FetchFeedDocumentOptions = {},
): Promise<ParsedFeedEntry[]> {
  const response = await (options.fetchFeed ?? fetch)(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_FEED_FETCH_TIMEOUT_MS),
    headers: {
      accept: "application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Feed fetch failed: ${response.status} ${response.statusText}`);
  }

  return parseFeedXml(await response.text());
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return decodeXmlText(String(value));
  if (typeof value === "object" && "#text" in value) {
    return textValue((value as { "#text"?: unknown })["#text"]);
  }
  return "";
}

function decodeXmlText(value: string) {
  return value
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function dateValue(value: unknown): Date | undefined {
  const raw = textValue(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function optionalFields(fields: {
  excerpt?: string | undefined;
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

export function parseFeedXml(xml: string, limit = Number.POSITIVE_INFINITY): ParsedFeedEntry[] {
  const document = parser.parse(xml) as {
    rss?: { channel?: { item?: unknown } };
    feed?: { entry?: unknown };
  };

  if (document.rss?.channel?.item) {
    return asArray(document.rss.channel.item)
      .slice(0, limit)
      .map((item) => {
        const rssItem = item as Record<string, unknown>;
        const excerpt = textValue(rssItem.description) || undefined;
        const author = textValue(rssItem.author) || textValue(rssItem["dc:creator"]) || undefined;
        const publishedAt = dateValue(rssItem.pubDate);
        return {
          title: textValue(rssItem.title),
          url: textValue(rssItem.link),
          content: textValue(rssItem["content:encoded"]) || textValue(rssItem.description),
          ...optionalFields({ excerpt, author, publishedAt }),
        };
      })
      .filter((entry) => entry.title && entry.url);
  }

  if (document.feed?.entry) {
    return asArray(document.feed.entry)
      .slice(0, limit)
      .map((item) => {
        const atomEntry = item as Record<string, unknown>;
        const excerpt = textValue(atomEntry.summary) || undefined;
        const author = textValue((atomEntry.author as { name?: unknown } | undefined)?.name) || undefined;
        const publishedAt = dateValue(atomEntry.published) ?? dateValue(atomEntry.updated);
        return {
          title: textValue(atomEntry.title),
          url: atomLinkValue(atomEntry.link),
          content: textValue(atomEntry.content) || textValue(atomEntry.summary),
          ...optionalFields({ excerpt, author, publishedAt }),
        };
      })
      .filter((entry) => entry.title && entry.url);
  }

  return [];
}
