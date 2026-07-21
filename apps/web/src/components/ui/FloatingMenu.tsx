"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  PrototypeIcon,
  type PrototypeIconName,
} from "../shell/PrototypeIcon";

const POPOVER_EXIT_MS = 140;
const VIEWPORT_GAP = 8;
const FloatingMenuCloseContext = createContext<(() => void) | null>(null);

interface PopoverPosition {
  left: number;
  top: number;
  origin: `${"top" | "bottom"} ${"left" | "right"}`;
}

interface PopoverBoundary {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface PopoverMenuProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "end";
  gap?: number;
  boundary?: "viewport" | "main";
  placement?: "bottom" | "top";
}

function getPopoverPosition(
  anchor: HTMLElement,
  menu: HTMLDivElement | null,
  align: "start" | "end",
  gap: number,
  boundaryMode: "viewport" | "main",
  placement: "bottom" | "top",
): PopoverPosition {
  const rect = anchor.getBoundingClientRect();
  const boundary = getPopoverBoundary(anchor, boundaryMode);
  const width = menu?.offsetWidth || 144;
  const height = menu?.offsetHeight || 120;
  const rawLeft = align === "start" ? rect.left : rect.right - width;
  const rawTop =
    placement === "top" ? rect.top - height - gap : rect.bottom + gap;
  const minLeft = boundary.left + VIEWPORT_GAP;
  const maxLeft = Math.max(minLeft, boundary.right - width - VIEWPORT_GAP);
  const minTop = boundary.top + VIEWPORT_GAP;
  const maxTop = Math.max(minTop, boundary.bottom - height - VIEWPORT_GAP);
  const clampedLeft = Math.min(maxLeft, Math.max(minLeft, rawLeft));
  const clampedTop = Math.min(maxTop, Math.max(minTop, rawTop));
  const originX = clampedLeft < rawLeft ? "right" : "left";
  const originY =
    placement === "top"
      ? clampedTop > rawTop
        ? "top"
        : "bottom"
      : clampedTop < rawTop
        ? "bottom"
        : "top";

  return {
    left: clampedLeft,
    top: clampedTop,
    origin: `${originY} ${originX}`,
  };
}

function getPopoverBoundary(
  anchor: HTMLElement,
  boundaryMode: "viewport" | "main",
): PopoverBoundary {
  const main =
    boundaryMode === "main"
      ? anchor.closest(".mewmo-shell__main") ??
        document.querySelector(".mewmo-shell__main")
      : null;
  if (main instanceof HTMLElement) {
    const rect = main.getBoundingClientRect();
    if (rect.width > VIEWPORT_GAP * 2 && rect.height > VIEWPORT_GAP * 2) {
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    }
  }

  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
}

export function PopoverMenu({
  open,
  anchorRef,
  children,
  className = "",
  onOpenChange,
  align = "start",
  gap = 6,
  boundary = "viewport",
  placement = "bottom",
}: PopoverMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const [position, setPosition] = useState<PopoverPosition>({
    left: VIEWPORT_GAP,
    top: VIEWPORT_GAP,
    origin: "top left",
  });

  const syncPosition = useCallback(() => {
    const anchor = anchorRef?.current;
    if (!anchor) return;
      setPosition(
      getPopoverPosition(
        anchor,
        menuRef.current,
        align,
        gap,
        boundary,
        placement,
      ),
    );
  }, [align, anchorRef, boundary, gap, placement]);
  const closeMenu = useCallback(() => onOpenChange?.(false), [onOpenChange]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }

    const timer = window.setTimeout(() => setMounted(false), POPOVER_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open, syncPosition]);

  useLayoutEffect(() => {
    if (mounted) syncPosition();
  }, [mounted, open, syncPosition]);

  useEffect(() => {
    if (!mounted) return;

    syncPosition();
    const closeOnPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        anchorRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      )
        return;
      onOpenChange?.(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onOpenChange?.(false);
    };

    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
    document.addEventListener("mousedown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape, true);

    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
      document.removeEventListener("mousedown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [anchorRef, mounted, onOpenChange, syncPosition]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={menuRef}
      className={`mewmo-popover-card mewmo-floating-menu ${className}`}
      data-state={open ? "open" : "closed"}
      style={
            {
              "--popover-left": `${position.left}px`,
              "--popover-top": `${position.top}px`,
              "--popover-origin": position.origin,
            } as CSSProperties
          }
      onClick={(event) => event.stopPropagation()}
    >
      <FloatingMenuCloseContext.Provider value={closeMenu}>
        {children}
      </FloatingMenuCloseContext.Provider>
    </div>,
    document.body,
  );
}

export function FloatingMenu(props: PopoverMenuProps) {
  return <PopoverMenu {...props} />;
}

export function useFloatingMenuClose() {
  return useContext(FloatingMenuCloseContext);
}

function FloatingMenuIcon({ icon }: { icon: PrototypeIconName }) {
  return (
    <span className="mewmo-floating-menu__icon">
      <PrototypeIcon name={icon} size={16} />
    </span>
  );
}

export function FloatingMenuButton({
  children,
  icon,
  checked = false,
  danger = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  icon: PrototypeIconName;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const closeMenu = useContext(FloatingMenuCloseContext);

  return (
    <button
      type="button"
      className={`mewmo-floating-menu__item ${danger ? "mewmo-floating-menu__item--danger" : ""}`}
      disabled={disabled}
      onClick={() => {
        onClick?.();
        closeMenu?.();
      }}
    >
      <FloatingMenuIcon icon={icon} />
      <span>{children}</span>
      {checked && (
        <span className="mewmo-floating-menu__check">
          <PrototypeIcon name="check" size={14} />
        </span>
      )}
    </button>
  );
}

export function FloatingMenuLink({
  children,
  href,
  icon,
  onClick,
  scroll,
  target,
  rel,
}: {
  children: ReactNode;
  href: string;
  icon: PrototypeIconName;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  scroll?: boolean;
  target?: string;
  rel?: string;
}) {
  const closeMenu = useContext(FloatingMenuCloseContext);

  return (
    <Link
      href={href}
      className="mewmo-floating-menu__item"
      onClick={(event) => {
        onClick?.(event);
        closeMenu?.();
      }}
      {...(scroll !== undefined ? { scroll } : {})}
      {...(target !== undefined ? { target } : {})}
      {...(rel !== undefined ? { rel } : {})}
    >
      <FloatingMenuIcon icon={icon} />
      <span>{children}</span>
    </Link>
  );
}
