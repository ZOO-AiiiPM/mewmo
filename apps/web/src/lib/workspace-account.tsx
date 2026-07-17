"use client";

import { createContext, useContext, type ReactNode } from "react";

const WorkspaceAccountContext = createContext<string | null>(null);

export function WorkspaceAccountProvider({
  userId,
  children,
}: {
  userId: string | null | undefined;
  children: ReactNode;
}) {
  return (
    <WorkspaceAccountContext.Provider value={userId ?? null}>
      {children}
    </WorkspaceAccountContext.Provider>
  );
}

export function useWorkspaceAccountId() {
  const userId = useContext(WorkspaceAccountContext);
  if (!userId) throw new Error("Workspace account is unavailable");
  return userId;
}
