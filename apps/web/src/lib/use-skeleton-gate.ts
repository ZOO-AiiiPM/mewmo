"use client";

import { useEffect, useRef, useState } from "react";

const LOADING_CAP = 0.9;
/** Higher = slower crawl while waiting on the network. */
const LOADING_TAU_MS = 1400;
const FINISH_MS = 220;

/**
 * Single-pass left→right progress for loading placeholders.
 * - While loading: eases toward ~90%, never loops.
 * - When load ends: finishes to 100%, then ready=true so content can appear.
 * Duration therefore tracks real wait time.
 */
export function useSkeletonGate(loading: boolean) {
  const [progress, setProgress] = useState(loading ? 0 : 1);
  const [ready, setReady] = useState(!loading);
  const loadingRef = useRef(loading);
  const progressRef = useRef(progress);
  const startedAtRef = useRef<number | null>(loading ? performance.now() : null);
  const finishFromRef = useRef(0);
  const finishStartedAtRef = useRef<number | null>(null);
  const phaseRef = useRef<"idle" | "loading" | "finishing">(
    loading ? "loading" : "idle",
  );

  progressRef.current = progress;
  loadingRef.current = loading;

  useEffect(() => {
    if (loading) {
      phaseRef.current = "loading";
      startedAtRef.current = performance.now();
      finishStartedAtRef.current = null;
      setReady(false);
      setProgress(0);
      progressRef.current = 0;
    } else if (phaseRef.current === "loading") {
      phaseRef.current = "finishing";
      finishFromRef.current = progressRef.current;
      finishStartedAtRef.current = performance.now();
    } else if (phaseRef.current === "idle") {
      setReady(true);
      setProgress(1);
    }
  }, [loading]);

  useEffect(() => {
    if (ready && !loading) return;

    let frame = 0;
    const tick = (now: number) => {
      if (phaseRef.current === "loading") {
        const started = startedAtRef.current ?? now;
        const elapsed = Math.max(0, now - started);
        const next = LOADING_CAP * (1 - Math.exp(-elapsed / LOADING_TAU_MS));
        setProgress(next);
        progressRef.current = next;
        frame = requestAnimationFrame(tick);
        return;
      }

      if (phaseRef.current === "finishing") {
        const started = finishStartedAtRef.current ?? now;
        const t = Math.min(1, (now - started) / FINISH_MS);
        const eased = 1 - (1 - t) ** 3;
        const next = finishFromRef.current + (1 - finishFromRef.current) * eased;
        setProgress(next);
        progressRef.current = next;
        if (t >= 1) {
          phaseRef.current = "idle";
          setProgress(1);
          setReady(true);
          return;
        }
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [loading, ready]);

  return { ready, progress };
}
