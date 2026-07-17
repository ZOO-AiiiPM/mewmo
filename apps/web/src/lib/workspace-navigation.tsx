"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface WorkspaceNavigationContextValue {
  pendingHref: string | null;
  beginNavigation: (href: string) => void;
}

const WorkspaceNavigationContext = createContext<WorkspaceNavigationContextValue | null>(null);

function navigationTargetCommitted(currentHref: string, pendingHref: string) {
  if (pendingHref.includes("?")) return currentHref === pendingHref;
  return currentHref === pendingHref || currentHref.startsWith(`${pendingHref}?`);
}

export function WorkspaceNavigationProvider({
  children,
  onPendingChange,
}: {
  children: ReactNode;
  onPendingChange?: (pending: boolean) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentHref = searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const beginNavigation = useCallback((href: string) => {
    setPendingHref(href);
    onPendingChange?.(true);
    try {
      performance.mark("mewmo:workspace-navigation:start", { detail: { href } });
    } catch {
      // Browser performance marks are diagnostic and must not block navigation.
    }
  }, [onPendingChange]);

  useEffect(() => {
    if (!pendingHref) return;
    if (!navigationTargetCommitted(currentHref, pendingHref)) return;
    try {
      performance.mark("mewmo:workspace-navigation:commit", { detail: { href: currentHref } });
      performance.measure(
        "mewmo:workspace-navigation",
        "mewmo:workspace-navigation:start",
        "mewmo:workspace-navigation:commit",
      );
    } catch {
      // Some browsers or test environments do not expose User Timing fully.
    }
    setPendingHref(null);
    onPendingChange?.(false);
  }, [currentHref, onPendingChange, pendingHref]);

  const value = useMemo(
    () => ({ pendingHref, beginNavigation }),
    [beginNavigation, pendingHref],
  );

  return (
    <WorkspaceNavigationContext.Provider value={value}>
      {children}
    </WorkspaceNavigationContext.Provider>
  );
}

export function useWorkspaceNavigation() {
  const value = useContext(WorkspaceNavigationContext);
  if (!value) throw new Error("Workspace navigation is unavailable");
  return value;
}
