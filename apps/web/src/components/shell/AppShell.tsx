"use client";

import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AI_FAB_DEFAULT_BOTTOM,
  clampAiFabBottom,
} from "../../lib/ai-fab-position";
import { WorkspaceAccountProvider } from "../../lib/workspace-account";
import { scopeWorkspaceDataCache } from "../../lib/workspace-data-cache";
import { WorkspaceNavigationProvider } from "../../lib/workspace-navigation";
import { AISidebar, AISidebarProvider } from "./AISidebar";
import { PrototypeIcon } from "./PrototypeIcon";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  children: ReactNode;
  user?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

const AI_W_DEFAULT = 320;
const AI_W_MIN = 280;
const READ_W_FLOOR = 460;

function clampAiWidth(width: number) {
  return Math.max(
    AI_W_MIN,
    Math.min(width, Math.min(640, window.innerWidth - READ_W_FLOOR)),
  );
}

export function AppShell({ children, user }: AppShellProps) {
  scopeWorkspaceDataCache(user?.id);
  const shellRef = useRef<HTMLDivElement>(null);
  const sidebarPeekTimer = useRef<number | null>(null);
  const aiFabDragRef = useRef<{
    startY: number;
    startBottom: number;
    moved: boolean;
  } | null>(null);
  const suppressAiFabClickRef = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPeek, setSidebarPeek] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiWidth, setAiWidth] = useState(AI_W_DEFAULT);
  const [aiResizing, setAiResizing] = useState(false);
  const [aiFabBottom, setAiFabBottom] = useState(AI_FAB_DEFAULT_BOTTOM);
  const [aiFabDragging, setAiFabDragging] = useState(false);


  const clearSidebarPeekTimer = useCallback(() => {
    if (sidebarPeekTimer.current === null) return;
    window.clearTimeout(sidebarPeekTimer.current);
    sidebarPeekTimer.current = null;
  }, []);

  useEffect(() => {
    if (!sidebarCollapsed) {
      clearSidebarPeekTimer();
      setSidebarPeek(false);
      return;
    }

    const handleSidebarPeek = (event: MouseEvent) => {
      if (event.clientX < 18) {
        clearSidebarPeekTimer();
        setSidebarPeek(true);
      }
    };

    window.addEventListener("mousemove", handleSidebarPeek);
    return () => {
      window.removeEventListener("mousemove", handleSidebarPeek);
      clearSidebarPeekTimer();
    };
  }, [clearSidebarPeekTimer, sidebarCollapsed]);

  const scheduleSidebarPeekClose = () => {
    if (!sidebarCollapsed) return;
    clearSidebarPeekTimer();
    sidebarPeekTimer.current = window.setTimeout(() => {
      setSidebarPeek(false);
      sidebarPeekTimer.current = null;
    }, 200);
  };

  const startAiResize = (event: PointerEvent<HTMLDivElement>) => {
    const shell = shellRef.current;
    if (!shell) return;

    event.preventDefault();
    const dragX0 = event.clientX;
    const dragW0 =
      Number.parseFloat(getComputedStyle(shell).getPropertyValue("--ai-w")) ||
      aiWidth;

    setAiResizing(true);
    document.body.style.cursor = "col-resize";

    const onAiMove = (moveEvent: globalThis.PointerEvent) => {
      const nextWidth = clampAiWidth(dragW0 + (dragX0 - moveEvent.clientX));
      shell.style.setProperty("--ai-w", `${nextWidth}px`);
      setAiWidth(nextWidth);
    };
    const onAiUp = () => {
      setAiResizing(false);
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onAiMove);
      window.removeEventListener("pointerup", onAiUp);
    };

    window.addEventListener("pointermove", onAiMove);
    window.addEventListener("pointerup", onAiUp);
  };

  const startAiFabDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or stale pointer events can be uncapturable.
    }
    aiFabDragRef.current = {
      startY: event.clientY,
      startBottom: aiFabBottom,
      moved: false,
    };
    setAiFabDragging(true);
  };

  const moveAiFab = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = aiFabDragRef.current;
    if (!drag) return;

    const delta = drag.startY - event.clientY;
    if (Math.abs(delta) > 4) drag.moved = true;
    setAiFabBottom(
      clampAiFabBottom(drag.startBottom + delta, window.innerHeight),
    );
  };

  const endAiFabDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = aiFabDragRef.current;
    if (!drag) return;

    suppressAiFabClickRef.current = drag.moved;
    aiFabDragRef.current = null;
    setAiFabDragging(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore invalid pointer ids from canceled or synthetic events.
    }
  };

  const openAi = () => {
    if (suppressAiFabClickRef.current) {
      suppressAiFabClickRef.current = false;
      return;
    }
    setAiOpen(true);
  };

  return (
    <WorkspaceAccountProvider userId={user?.id}>
      <WorkspaceNavigationProvider>
        <div
          ref={shellRef}
          className={[
            "mewmo-shell",
            sidebarCollapsed ? "mewmo-shell--sidebar-collapsed" : "",
            sidebarPeek ? "mewmo-shell--sidebar-peek" : "",
            aiOpen ? "mewmo-shell--ai-open" : "",
            aiResizing ? "mewmo-shell--ai-resizing" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={
            {
              "--ai-w": `${aiWidth}px`,
              "--ai-fab-bottom": `${aiFabBottom}px`,
            } as CSSProperties
          }
        >
          <Sidebar
            user={user}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
            onMouseEnter={clearSidebarPeekTimer}
            onMouseLeave={scheduleSidebarPeekClose}
          />
          <AISidebarProvider>
            <main className="mewmo-shell__main">{children}</main>
            <AISidebar open={aiOpen} onOpenChange={setAiOpen} />
          </AISidebarProvider>
          <div
            className="mewmo-ai-resizer"
            role="separator"
            aria-label="调整 mewmo 宽度"
            aria-orientation="vertical"
            onPointerDown={startAiResize}
            onDoubleClick={() => setAiWidth(AI_W_DEFAULT)}
          />
          {!aiOpen && (
            <button
              type="button"
              className={`mewmo-ai-fab ${aiFabDragging ? "mewmo-ai-fab--dragging" : ""}`}
              onPointerDown={startAiFabDrag}
              onPointerMove={moveAiFab}
              onPointerUp={endAiFabDrag}
              onPointerCancel={endAiFabDrag}
              onClick={openAi}
              aria-label="打开 mewmo"
              title="打开 mewmo"
            >
              <PrototypeIcon name="mewmo-logo" size={22} />
            </button>
          )}
        </div>
      </WorkspaceNavigationProvider>
    </WorkspaceAccountProvider>
  );
}
