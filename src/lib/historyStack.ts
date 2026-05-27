// 浏览器风历史栈：truncate-and-append。SubscriptionLayout 的 entry 浏览历史和
// App.tsx 笔记 tab 的浏览历史共用同一个状态机。
//
// 不写成 hook 是因为 App.tsx 的历史栈是嵌在 tabs 数组里每 tab 一份的，hook 形式
// 没法对齐；纯函数 + 调用方 setX(prev => ...) 在 SubscriptionLayout 单 state、
// App.tsx 的 setTabs prev.map 两个场景都能直接套。

export type HistoryState<T> = {
  history: T[];
  idx: number;
};

export const emptyHistory = <T>(): HistoryState<T> => ({ history: [], idx: -1 });

/** 截断 forward 之后追加新 item（浏览器历史经典模式）。
 *  当前位置的 item 跟新 item 相等（按 equals 判断）→ 不入栈不动 idx，避免双击 /
 *  重复点同一条让 idx 越界。equals 默认 ===，复杂对象传按 id 比较的回调。 */
export function pushHistory<T>(
  prev: HistoryState<T>,
  item: T,
  equals: (a: T, b: T) => boolean = (a, b) => a === b,
): HistoryState<T> {
  const truncated = prev.idx >= 0 ? prev.history.slice(0, prev.idx + 1) : [];
  if (truncated.length > 0 && equals(truncated[truncated.length - 1], item)) {
    return prev;
  }
  const next = [...truncated, item];
  return { history: next, idx: next.length - 1 };
}

export const goBack = <T>(prev: HistoryState<T>): HistoryState<T> => ({
  ...prev,
  idx: Math.max(0, prev.idx - 1),
});

export const goForward = <T>(prev: HistoryState<T>): HistoryState<T> => ({
  ...prev,
  idx: Math.min(prev.history.length - 1, prev.idx + 1),
});

export const canGoBack = <T>(s: HistoryState<T>): boolean => s.idx > 0;
export const canGoForward = <T>(s: HistoryState<T>): boolean =>
  s.idx >= 0 && s.idx < s.history.length - 1;

/** 当前选中的 item，无选中返回 null（跟 React 习惯一致，不用 undefined） */
export const currentItem = <T>(s: HistoryState<T>): T | null =>
  s.idx >= 0 && s.idx < s.history.length ? s.history[s.idx] : null;
