const scrollPositions = new Map<string, number>();

export function getSessionScrollPosition(key: string): number | undefined {
  return scrollPositions.get(key);
}

export function rememberSessionScrollPosition(key: string, top: number) {
  scrollPositions.set(key, Math.max(0, Math.floor(top)));
}
