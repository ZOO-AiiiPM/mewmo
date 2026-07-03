"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { AISidebar } from "./AISidebar";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  children: ReactNode;
  user?: { name?: string | null; email?: string | null; image?: string | null };
}

export function AppShell({ children, user }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPeek, setSidebarPeek] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <div
      className={[
        "mewmo-shell",
        sidebarCollapsed ? "mewmo-shell--sidebar-collapsed" : "",
        sidebarPeek ? "mewmo-shell--sidebar-peek" : "",
        aiOpen ? "mewmo-shell--ai-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseMove={(event) => {
        if (sidebarCollapsed && event.clientX <= 14) setSidebarPeek(true);
      }}
    >
      <Sidebar
        user={user}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        onMouseLeave={() => {
          if (sidebarCollapsed) setSidebarPeek(false);
        }}
      />
      <main className="mewmo-shell__main">{children}</main>
      <AISidebar open={aiOpen} onOpenChange={setAiOpen} />
      {!aiOpen && (
        <button type="button" className="mewmo-ai-fab" onClick={() => setAiOpen(true)} aria-label="Open AI rail">
          AI
        </button>
      )}
    </div>
  );
}
