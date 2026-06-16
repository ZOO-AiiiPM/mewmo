import { describe, test, expect } from 'vitest'
import {
  emptyHistory,
  pushHistory,
  goBack,
  goForward,
  canGoBack,
  canGoForward,
  currentItem,
} from './historyStack'

describe('historyStack', () => {
  describe('emptyHistory', () => {
    test('produces empty state with idx -1', () => {
      const s = emptyHistory<string>()
      expect(s.history).toEqual([])
      expect(s.idx).toBe(-1)
    })
  })

  describe('pushHistory', () => {
    test('appends item and advances idx', () => {
      const s0 = emptyHistory<string>()
      const s1 = pushHistory(s0, 'a')
      expect(s1.history).toEqual(['a'])
      expect(s1.idx).toBe(0)

      const s2 = pushHistory(s1, 'b')
      expect(s2.history).toEqual(['a', 'b'])
      expect(s2.idx).toBe(1)
    })

    test('truncates forward history on new push', () => {
      let s = emptyHistory<string>()
      s = pushHistory(s, 'a')
      s = pushHistory(s, 'b')
      s = pushHistory(s, 'c')
      s = goBack(s) // idx=1, at 'b'
      s = pushHistory(s, 'x') // truncate 'c', append 'x'
      expect(s.history).toEqual(['a', 'b', 'x'])
      expect(s.idx).toBe(2)
    })

    test('deduplicates consecutive identical items with default ===', () => {
      let s = emptyHistory<string>()
      s = pushHistory(s, 'a')
      const s2 = pushHistory(s, 'a')
      expect(s2).toBe(s) // same reference, no mutation
    })

    test('deduplicates with custom equals', () => {
      type Item = { id: number; label: string }
      const eq = (a: Item, b: Item) => a.id === b.id
      let s = emptyHistory<Item>()
      s = pushHistory(s, { id: 1, label: 'first' }, eq)
      const s2 = pushHistory(s, { id: 1, label: 'updated' }, eq)
      expect(s2).toBe(s)
    })
  })

  describe('goBack / goForward', () => {
    test('goBack decrements idx, clamps at 0', () => {
      let s = emptyHistory<string>()
      s = pushHistory(s, 'a')
      s = pushHistory(s, 'b')
      s = goBack(s)
      expect(s.idx).toBe(0)
      s = goBack(s)
      expect(s.idx).toBe(0) // clamped
    })

    test('goForward increments idx, clamps at end', () => {
      let s = emptyHistory<string>()
      s = pushHistory(s, 'a')
      s = pushHistory(s, 'b')
      s = goBack(s) // idx=0
      s = goForward(s)
      expect(s.idx).toBe(1)
      s = goForward(s)
      expect(s.idx).toBe(1) // clamped
    })
  })

  describe('canGoBack / canGoForward', () => {
    test('empty history: both false', () => {
      const s = emptyHistory<string>()
      expect(canGoBack(s)).toBe(false)
      expect(canGoForward(s)).toBe(false)
    })

    test('single item: both false', () => {
      let s = emptyHistory<string>()
      s = pushHistory(s, 'a')
      expect(canGoBack(s)).toBe(false)
      expect(canGoForward(s)).toBe(false)
    })

    test('at end: canGoBack true, canGoForward false', () => {
      let s = emptyHistory<string>()
      s = pushHistory(s, 'a')
      s = pushHistory(s, 'b')
      expect(canGoBack(s)).toBe(true)
      expect(canGoForward(s)).toBe(false)
    })

    test('at start: canGoBack false, canGoForward true', () => {
      let s = emptyHistory<string>()
      s = pushHistory(s, 'a')
      s = pushHistory(s, 'b')
      s = goBack(s)
      expect(canGoBack(s)).toBe(false)
      expect(canGoForward(s)).toBe(true)
    })
  })

  describe('currentItem', () => {
    test('returns null for empty history', () => {
      expect(currentItem(emptyHistory<string>())).toBeNull()
    })

    test('returns item at current idx', () => {
      let s = emptyHistory<string>()
      s = pushHistory(s, 'a')
      s = pushHistory(s, 'b')
      expect(currentItem(s)).toBe('b')
      s = goBack(s)
      expect(currentItem(s)).toBe('a')
    })
  })
})
