import { describe, expect, test } from 'vitest';
import { getTabPillWidth } from './tabBarLayout';

describe('getTabPillWidth', () => {
  test('uses the max width when there is enough room', () => {
    expect(getTabPillWidth(1200, 4)).toBe(160);
  });

  test('compresses tabs when they would overflow the rail', () => {
    expect(getTabPillWidth(820, 8)).toBeLessThan(160);
    expect(getTabPillWidth(820, 8)).toBeGreaterThan(80);
  });

  test('keeps compressing instead of falling back to horizontal scroll', () => {
    expect(getTabPillWidth(420, 20)).toBe(17);
  });
});
