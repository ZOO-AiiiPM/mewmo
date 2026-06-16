import { describe, test, expect } from 'vitest'
import { getBucket, groupByBucket, formatListItemDate } from './dateBuckets'

describe('dateBuckets', () => {
  // 固定 now 避免测试时区/日期漂移
  const now = new Date('2026-06-15T14:00:00+08:00')
  const toUnix = (d: Date) => Math.floor(d.getTime() / 1000)

  describe('getBucket', () => {
    test('timestamp today → today', () => {
      const todayMorning = new Date('2026-06-15T08:00:00+08:00')
      expect(getBucket(toUnix(todayMorning), now)).toBe('today')
    })

    test('timestamp yesterday → yesterday', () => {
      const yesterday = new Date('2026-06-14T23:59:00+08:00')
      expect(getBucket(toUnix(yesterday), now)).toBe('yesterday')
    })

    test('3 days ago → week', () => {
      const threeDaysAgo = new Date('2026-06-12T10:00:00+08:00')
      expect(getBucket(toUnix(threeDaysAgo), now)).toBe('week')
    })

    test('15 days ago → month', () => {
      const fifteenDaysAgo = new Date('2026-05-31T10:00:00+08:00')
      expect(getBucket(toUnix(fifteenDaysAgo), now)).toBe('month')
    })

    test('100 days ago → year', () => {
      const hundredDaysAgo = new Date('2026-03-07T10:00:00+08:00')
      expect(getBucket(toUnix(hundredDaysAgo), now)).toBe('year')
    })

    test('400 days ago → older', () => {
      const longAgo = new Date('2025-05-11T10:00:00+08:00')
      expect(getBucket(toUnix(longAgo), now)).toBe('older')
    })

    test('boundary: exactly 7 days ago midnight → week (inclusive)', () => {
      const todayMidnight = new Date('2026-06-15T00:00:00+08:00')
      const sevenDaysAgo = new Date(todayMidnight.getTime() - 7 * 86_400_000)
      expect(getBucket(toUnix(sevenDaysAgo), now)).toBe('week')
    })
  })

  describe('groupByBucket', () => {
    test('groups items in bucket order', () => {
      const now = new Date()
      const todayTs = Math.floor(now.getTime() / 1000) - 3600 // 1 hour ago
      const yesterdayTs = todayTs - 86400 // 25 hours ago
      const items = [
        { id: 1, updated_at: todayTs },
        { id: 2, updated_at: yesterdayTs },
        { id: 3, updated_at: todayTs + 100 },
      ]
      const groups = groupByBucket(items)
      expect(groups[0].bucket).toBe('today')
      expect(groups[0].items.map(i => i.id)).toEqual([1, 3])
      expect(groups[1].bucket).toBe('yesterday')
      expect(groups[1].items.map(i => i.id)).toEqual([2])
    })

    test('custom getTs extractor', () => {
      const now = new Date()
      const todayTs = Math.floor(now.getTime() / 1000) - 3600
      const oldTs = todayTs - 400 * 86400
      const items = [
        { name: 'a', saved_at: todayTs },
        { name: 'b', saved_at: oldTs },
      ]
      const groups = groupByBucket(items, i => i.saved_at)
      expect(groups[0].bucket).toBe('today')
      expect(groups[1].bucket).toBe('older')
    })

    test('empty input returns empty', () => {
      expect(groupByBucket([])).toEqual([])
    })
  })

  describe('formatListItemDate', () => {
    test('today → HH:mm format', () => {
      const ts = toUnix(new Date('2026-06-15T09:30:00+08:00'))
      const result = formatListItemDate(ts, 'today')
      expect(result).toMatch(/09:30/)
    })

    test('yesterday → 昨天', () => {
      const ts = toUnix(new Date('2026-06-14T10:00:00+08:00'))
      expect(formatListItemDate(ts, 'yesterday')).toBe('昨天')
    })

    test('week → 周X', () => {
      // 2026-06-12 is a Friday
      const ts = toUnix(new Date('2026-06-12T10:00:00+08:00'))
      expect(formatListItemDate(ts, 'week')).toBe('周五')
    })

    test('month/year → M/D numeric', () => {
      const ts = toUnix(new Date('2026-05-20T10:00:00+08:00'))
      const result = formatListItemDate(ts, 'month')
      expect(result).toMatch(/5\/20/)
    })

    test('older → YY/M/D', () => {
      const ts = toUnix(new Date('2024-03-05T10:00:00+08:00'))
      const result = formatListItemDate(ts, 'older')
      expect(result).toMatch(/24\/3\/5/)
    })
  })
})
