"use client";

import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AI_FAB_DEFAULT_BOTTOM,
  AI_FAB_LONG_PRESS_MS,
  clampAiFabBottom,
  isAiFabDragMoved,
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
  const ts = useTranslations("shell");
  const pathname = usePathname();
  // /mew is itself a full-page agent surface; the AI fab would be redundant there.
  const onMewHome = pathname.startsWith("/mew");
  const shellRef = useRef<HTMLDivElement>(null);
  const sidebarPeekTimer = useRef<number | null>(null);
  const aiFabDragRef = useRef<{
    startX: number;
    startY: number;
    startBottom: number;
    active: boolean;
    cancelled: boolean;
  } | null>(null);
  const aiFabPressTimer = useRef<number | null>(null);
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

  const clearAiFabPressTimer = useCallback(() => {
    if (aiFabPressTimer.current === null) return;
    window.clearTimeout(aiFabPressTimer.current);
    aiFabPressTimer.current = null;
  }, []);

  useEffect(() => clearAiFabPressTimer, [clearAiFabPressTimer]);

  const startAiFabDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or stale pointer events can be uncapturable.
    }
    // Reset click-suppression at the start of every gesture. Without this, a
    // prior real drag that the browser did NOT follow with a `click` event
    // (common on touch) would leave suppressAiFabClickRef=true and silently
    // eat the next genuine tap. See ZOO-54.
    suppressAiFabClickRef.current = false;
    aiFabDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startBottom: aiFabBottom,
      active: false,
      cancelled: false,
    };
    // Drag mode arms only after a deliberate hold; until then the FAB never
    // moves, so a quick tap reads as a clean click with zero visual nudge.
    clearAiFabPressTimer();
    aiFabPressTimer.current = window.setTimeout(() => {
      aiFabPressTimer.current = null;
      const drag = aiFabDragRef.current;
      if (!drag || drag.cancelled) return;
      drag.active = true;
      setAiFabDragging(true);
    }, AI_FAB_LONG_PRESS_MS);
  };

  const moveAiFab = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = aiFabDragRef.current;
    if (!drag) return;

    if (drag.active) {
      setAiFabBottom(
        clampAiFabBottom(drag.startBottom + (drag.startY - event.clientY), window.innerHeight),
      );
      return;
    }
    // Not in drag mode yet: sub-threshold jitter is a tap in progress; larger
    // travel means this was a swipe, not a long press — void the gesture.
    if (!drag.cancelled && isAiFabDragMoved(drag.startX, drag.startY, event.clientX, event.clientY)) {
      drag.cancelled = true;
      clearAiFabPressTimer();
    }
  };

  const endAiFabDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = aiFabDragRef.current;
    if (!drag) return;

    clearAiFabPressTimer();
    suppressAiFabClickRef.current = drag.active || drag.cancelled;
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
            aria-label={ts("aiResizer")}
            aria-orientation="vertical"
            onPointerDown={startAiResize}
            onDoubleClick={() => setAiWidth(AI_W_DEFAULT)}
          />
          {!aiOpen && !onMewHome && (
            <button
              type="button"
              className={`mewmo-ai-fab ${aiFabDragging ? "mewmo-ai-fab--dragging" : ""}`}
              onPointerDown={startAiFabDrag}
              onPointerMove={moveAiFab}
              onPointerUp={endAiFabDrag}
              onPointerCancel={endAiFabDrag}
              onClick={openAi}
              aria-label={ts("aiFabOpen")}
              title={ts("aiFabTitle")}
            >
              <PrototypeIcon name="mewmo-logo" size={22} />
            </button>
          )}
        </div>
      </WorkspaceNavigationProvider>
    </WorkspaceAccountProvider>
  );
}
