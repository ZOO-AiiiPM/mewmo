export interface LiveRowScheduler {
  schedule: () => void;
  cancel: () => void;
}

interface LiveRowSchedulerOptions {
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
  maxDelayMs?: number;
}

/** Coalesce transcript projections into one frame, with a bounded fallback. */
export function createLiveRowScheduler(
  flush: () => void,
  options: LiveRowSchedulerOptions = {},
): LiveRowScheduler {
  let nextCycle = 0;
  let activeCycle: number | null = null;
  let frameHandle: number | null = null;
  let fallbackHandle: ReturnType<typeof setTimeout> | null = null;
  const requestFrame = options.requestFrame
    ?? (typeof requestAnimationFrame === "function" ? requestAnimationFrame : null);
  const cancelFrame = options.cancelFrame
    ?? (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : null);
  const maxDelayMs = options.maxDelayMs ?? 100;

  const cancel = () => {
    activeCycle = null;
    if (frameHandle !== null && cancelFrame) cancelFrame(frameHandle);
    if (fallbackHandle !== null) clearTimeout(fallbackHandle);
    frameHandle = null;
    fallbackHandle = null;
  };

  const schedule = () => {
    if (activeCycle !== null) return;
    if (!requestFrame) {
      flush();
      return;
    }
    const cycle = ++nextCycle;
    activeCycle = cycle;
    frameHandle = requestFrame(() => {
      if (activeCycle !== cycle) return;
      activeCycle = null;
      frameHandle = null;
      if (fallbackHandle !== null) clearTimeout(fallbackHandle);
      fallbackHandle = null;
      flush();
    });
    fallbackHandle = setTimeout(() => {
      if (activeCycle !== cycle) return;
      activeCycle = null;
      if (frameHandle !== null && cancelFrame) cancelFrame(frameHandle);
      frameHandle = null;
      fallbackHandle = null;
      flush();
    }, maxDelayMs);
  };

  return { schedule, cancel };
}
