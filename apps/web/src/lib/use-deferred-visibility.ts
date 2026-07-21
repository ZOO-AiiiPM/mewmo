"use client";

import { useEffect, useState } from "react";

/**
 * Gate loading placeholders.
 * Default delay is 0 so uncached reads replace empty/hint panes immediately.
 * Pass a positive delay only when a flash is worse than a brief blank.
 */
export function useDeferredVisibility(active: boolean, delayMs = 0) {
  const [visible, setVisible] = useState(delayMs === 0 ? active : false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    if (delayMs <= 0) {
      setVisible(true);
      return;
    }

    setVisible(false);
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return active && visible;
}
