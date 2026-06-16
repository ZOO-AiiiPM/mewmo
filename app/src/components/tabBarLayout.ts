export const TAB_MAX_WIDTH = 160;

const ADD_BUTTON_RESERVE = 32;
const DIVIDER_WIDTH = 2;

export function getTabPillWidth(railWidth: number, tabCount: number) {
  if (tabCount <= 0) return TAB_MAX_WIDTH;
  const dividerReserve = tabCount * DIVIDER_WIDTH;
  const usableWidth = Math.max(0, railWidth - ADD_BUTTON_RESERVE - dividerReserve);
  const idealWidth = Math.floor(usableWidth / tabCount);
  return Math.min(TAB_MAX_WIDTH, idealWidth);
}
