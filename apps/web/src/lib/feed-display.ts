interface FeedDisplayEntry {
  author?: string | null;
  sourceName?: string | null;
  url?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  feedId: string;
  feed: {
    title?: string | null;
  };
}

export function preferredFeedCardSource({
  feed,
  feedTitle,
  sourceName,
  url,
}: {
  feed?: { title?: string | null } | null;
  feedTitle?: string | null | undefined;
  sourceName?: string | null | undefined;
  url?: string | null | undefined;
}) {
  return feedTitle?.trim() || feed?.title?.trim() || sourceName?.trim() || domainFromUrl(url);
}

export function preferredFeedReaderSource({
  feed,
  sourceName,
  url,
  feedTitle,
}: {
  feed?: { title?: string | null } | null;
  sourceName?: string | null | undefined;
  url?: string | null | undefined;
  feedTitle?: string | null | undefined;
}) {
  return sourceName?.trim() || domainFromUrl(url) || feedTitle?.trim() || feed?.title?.trim() || "";
}

export function buildFeedCardMeta(
  entry: FeedDisplayEntry,
  selectedFeedId?: string | null,
): string[] {
  return compactMeta([
    entry.author,
    selectedFeedId
      ? null
      : preferredFeedCardSource({
          feedTitle: entry.feed.title,
          sourceName: entry.sourceName,
          url: entry.url,
        }),
    entry.publishedAt ?? entry.createdAt,
  ]);
}

export function buildFeedReaderMeta({
  entry,
}: {
  entry: FeedDisplayEntry;
}): string[] {
  return compactMeta([
    entry.author,
    preferredFeedReaderSource({
      sourceName: entry.sourceName,
      url: entry.url,
      feedTitle: entry.feed.title,
    }),
    entry.publishedAt ?? entry.createdAt,
  ]);
}

function compactMeta(items: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return items
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function domainFromUrl(url?: string | null) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
