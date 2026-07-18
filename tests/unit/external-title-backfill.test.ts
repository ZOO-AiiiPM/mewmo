import { describe, expect, it, vi } from "vitest";

import { backfillExternalTitles } from "../../tooling/external-title-backfill";

interface TestRow {
  id: string;
  title: string;
  version: number;
}

function createTitleModel(initialRows: TestRow[]) {
  const rows = initialRows.map((row) => ({ ...row }));
  const updateCalls: unknown[] = [];

  return {
    rows,
    updateCalls,
    model: {
      findMany: vi.fn(async (args: { take: number; cursor?: { id: string }; skip?: number }) => {
        const cursorIndex = args.cursor
          ? rows.findIndex((row) => row.id === args.cursor?.id) + (args.skip ?? 0)
          : 0;
        return rows.slice(Math.max(0, cursorIndex), Math.max(0, cursorIndex) + args.take)
          .map(({ id, title }) => ({ id, title }));
      }),
      updateMany: vi.fn(async (args: {
        where: { id: string; title: string };
        data: { title: string; version: { increment: number } };
      }) => {
        updateCalls.push(args);
        const row = rows.find(
          (item) => item.id === args.where.id && item.title === args.where.title,
        );
        if (!row) return { count: 0 };
        row.title = args.data.title;
        row.version += args.data.version.increment;
        return { count: 1 };
      }),
    },
  };
}

function createClient() {
  const feed = createTitleModel([
    { id: "feed-1", title: "Feed &amp;#8211; Title", version: 1 },
  ]);
  const feedEntry = createTitleModel([
    { id: "entry-1", title: "Entry &#x2013; Title", version: 2 },
  ]);
  const clip = createTitleModel([
    { id: "clip-1", title: "iOS & iPadOS - Guide 🐈", version: 3 },
  ]);

  return {
    feed,
    feedEntry,
    clip,
    client: {
      feed: feed.model,
      feedEntry: feedEntry.model,
      clip: clip.model,
    },
  };
}

describe("backfillExternalTitles", () => {
  it("reports matches without writing in dry-run mode", async () => {
    const fixture = createClient();

    const report = await backfillExternalTitles(fixture.client, {
      apply: false,
      batchSize: 1,
    });

    expect(report.totals).toEqual({ scanned: 3, matched: 2, updated: 0 });
    expect(report.models.feed.samples).toEqual([
      { id: "feed-1", before: "Feed &amp;#8211; Title", after: "Feed – Title" },
    ]);
    expect(fixture.feed.updateCalls).toHaveLength(0);
    expect(fixture.feedEntry.updateCalls).toHaveLength(0);
    expect(fixture.clip.updateCalls).toHaveLength(0);
  });

  it("updates changed titles safely and becomes a no-op on the second run", async () => {
    const fixture = createClient();

    const first = await backfillExternalTitles(fixture.client, {
      apply: true,
      batchSize: 1,
    });
    const second = await backfillExternalTitles(fixture.client, {
      apply: true,
      batchSize: 1,
    });

    expect(first.totals).toEqual({ scanned: 3, matched: 2, updated: 2 });
    expect(fixture.feed.rows[0]).toEqual({ id: "feed-1", title: "Feed – Title", version: 2 });
    expect(fixture.feedEntry.rows[0]).toEqual({ id: "entry-1", title: "Entry – Title", version: 3 });
    expect(fixture.clip.rows[0]).toEqual({ id: "clip-1", title: "iOS & iPadOS - Guide 🐈", version: 3 });
    expect(fixture.feed.updateCalls[0]).toEqual({
      where: { id: "feed-1", title: "Feed &amp;#8211; Title" },
      data: { title: "Feed – Title", version: { increment: 1 } },
    });
    expect(second.totals).toEqual({ scanned: 3, matched: 0, updated: 0 });
  });
});
