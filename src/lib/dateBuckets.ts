export type Bucket = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'older';

export const BUCKET_LABEL: Record<Bucket, string> = {
  today: '今天',
  yesterday: '昨天',
  week: '本周',
  month: '本月',
  year: '本年',
  older: '更早',
};

const BUCKET_ORDER: Bucket[] = ['today', 'yesterday', 'week', 'month', 'year', 'older'];

/** 按笔记 updated_at（unix 秒）落到对应时间桶。
 *  桶定义（互斥，rolling window 语义，符合"距今 N 天"的直觉）：
 *  - today: 今日 00:00 起
 *  - yesterday: 昨日 00:00 至今日 00:00
 *  - week: 距今 ≤ 7 天（不含今/昨）
 *  - month: 距今 ≤ 30 天（不含本周）
 *  - year: 距今 ≤ 365 天（不含本月）
 *  - older: > 365 天前
 *  注：用 rolling window 而非日历边界（"本周一至今"），避免周初的笔记被推到"本月"的反直觉问题。
 */
export function getBucket(ts: number, now: Date = new Date()): Bucket {
  const d = new Date(ts * 1000);
  const dayMs = 86_400_000;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - dayMs);
  const weekAgo = new Date(today.getTime() - 7 * dayMs);
  const monthAgo = new Date(today.getTime() - 30 * dayMs);
  const yearAgo = new Date(today.getTime() - 365 * dayMs);

  if (d >= today) return 'today';
  if (d >= yesterday) return 'yesterday';
  if (d >= weekAgo) return 'week';
  if (d >= monthAgo) return 'month';
  if (d >= yearAgo) return 'year';
  return 'older';
}

/** 把已按时间倒序排好的 items 按桶分组；桶之间按 BUCKET_ORDER；桶内保持原顺序。
 *  默认按 item.updated_at（保持 NoteList 原有调用兼容）；可传 getTs 自定义时间字段
 *  （如剪藏用 saved_at）。 */
export function groupByBucket<T>(
  items: T[],
  getTs: (item: T) => number = (item) => (item as { updated_at: number }).updated_at,
): Array<{ bucket: Bucket; items: T[] }> {
  const map = new Map<Bucket, T[]>();
  for (const it of items) {
    const b = getBucket(getTs(it));
    if (!map.has(b)) map.set(b, []);
    map.get(b)!.push(it);
  }
  return BUCKET_ORDER
    .filter(b => map.has(b))
    .map(b => ({ bucket: b, items: map.get(b)! }));
}
