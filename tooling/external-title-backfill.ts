import { normalizeExternalTitle } from "../packages/content/src/title";

interface TitleRow {
  id: string;
  title: string;
}

interface TitleModelClient {
  findMany(args: {
    select: { id: true; title: true };
    orderBy: { id: "asc" };
    take: number;
    cursor?: { id: string };
    skip?: number;
  }): Promise<TitleRow[]>;
  updateMany(args: {
    where: { id: string; title: string };
    data: { title: string; version: { increment: number } };
  }): Promise<{ count: number }>;
}

export interface ExternalTitleBackfillClient {
  feed: TitleModelClient;
  feedEntry: TitleModelClient;
  clip: TitleModelClient;
}

export interface ExternalTitleBackfillOptions {
  apply?: boolean;
  batchSize?: number;
}

interface TitleChangeSample {
  id: string;
  before: string;
  after: string;
}

interface TitleModelReport {
  scanned: number;
  matched: number;
  updated: number;
  samples: TitleChangeSample[];
}

export interface ExternalTitleBackfillReport {
  apply: boolean;
  models: {
    feed: TitleModelReport;
    feedEntry: TitleModelReport;
    clip: TitleModelReport;
  };
  totals: {
    scanned: number;
    matched: number;
    updated: number;
  };
}

const DEFAULT_BATCH_SIZE = 500;
const SAMPLE_LIMIT = 10;

export async function backfillExternalTitles(
  client: ExternalTitleBackfillClient,
  options: ExternalTitleBackfillOptions = {},
): Promise<ExternalTitleBackfillReport> {
  const apply = options.apply ?? false;
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const models = {
    feed: await backfillTitleModel(client.feed, { apply, batchSize }),
    feedEntry: await backfillTitleModel(client.feedEntry, { apply, batchSize }),
    clip: await backfillTitleModel(client.clip, { apply, batchSize }),
  };

  return {
    apply,
    models,
    totals: {
      scanned: models.feed.scanned + models.feedEntry.scanned + models.clip.scanned,
      matched: models.feed.matched + models.feedEntry.matched + models.clip.matched,
      updated: models.feed.updated + models.feedEntry.updated + models.clip.updated,
    },
  };
}

async function backfillTitleModel(
  model: TitleModelClient,
  options: { apply: boolean; batchSize: number },
): Promise<TitleModelReport> {
  const report: TitleModelReport = {
    scanned: 0,
    matched: 0,
    updated: 0,
    samples: [],
  };
  let cursor: string | undefined;

  while (true) {
    const rows = await model.findMany({
      select: { id: true, title: true },
      orderBy: { id: "asc" },
      take: options.batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      report.scanned += 1;
      const normalized = normalizeExternalTitle(row.title);
      if (!normalized || normalized === row.title) continue;

      report.matched += 1;
      if (report.samples.length < SAMPLE_LIMIT) {
        report.samples.push({ id: row.id, before: row.title, after: normalized });
      }
      if (!options.apply) continue;

      const result = await model.updateMany({
        where: { id: row.id, title: row.title },
        data: { title: normalized, version: { increment: 1 } },
      });
      report.updated += result.count;
    }

    cursor = rows.at(-1)?.id;
    if (rows.length < options.batchSize || !cursor) break;
  }

  return report;
}
