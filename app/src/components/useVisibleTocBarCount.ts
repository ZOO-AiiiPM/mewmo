import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

const MINI_BAR_HEIGHT = 2;
const MINI_BAR_GAP = 13;
const MINI_BAR_PADDING_Y = 24;

function getVisibleBarCount(containerHeight: number, total: number) {
  if (total <= 0) return 0;
  if (!Number.isFinite(containerHeight) || containerHeight <= 0) return total;

  const count = Math.floor(
    (containerHeight - MINI_BAR_PADDING_Y + MINI_BAR_GAP) / (MINI_BAR_HEIGHT + MINI_BAR_GAP),
  );
  return Math.max(0, Math.min(total, count));
}

export function useVisibleTocBarCount(
  containerRef: RefObject<HTMLElement | null>,
  total: number,
) {
  const [visibleCount, setVisibleCount] = useState(total);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      setVisibleCount(total);
      return;
    }

    const update = () => {
      const next = getVisibleBarCount(container.getBoundingClientRect().height, total);
      setVisibleCount(current => (current === next ? current : next));
    };

    update();

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(container);
    window.addEventListener('resize', update);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [containerRef, total]);

  return Math.min(visibleCount, total);
}
