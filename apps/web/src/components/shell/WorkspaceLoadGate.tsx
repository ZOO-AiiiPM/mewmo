"use client";

import type { ReactNode } from "react";
import { useSkeletonGate } from "../../lib/use-skeleton-gate";

interface WorkspaceLoadGateProps {
  loading: boolean;
  placeholder: (progress: number) => ReactNode;
  children: ReactNode;
}

/** Swap to children only after loading ends and the LTR sweep finishes. */
export function WorkspaceLoadGate({
  loading,
  placeholder,
  children,
}: WorkspaceLoadGateProps) {
  const { ready, progress } = useSkeletonGate(loading);
  if (!ready) return <>{placeholder(progress)}</>;
  return <>{children}</>;
}
