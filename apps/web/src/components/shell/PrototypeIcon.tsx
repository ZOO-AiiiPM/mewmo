"use client";

import type { ReactNode } from "react";

export type PrototypeIconName =
  | "home"
  | "calendar"
  | "caret"
  | "inbox"
  | "note"
  | "bookmark"
  | "pdf"
  | "shelf"
  | "book"
  | "rss"
  | "doc"
  | "media"
  | "video"
  | "mic"
  | "library"
  | "tag"
  | "trash"
  | "more-horizontal"
  | "more-vertical"
  | "plus"
  | "search"
  | "pen-new-square"
  | "chev-left"
  | "chev-right"
  | "expand"
  | "contract"
  | "pin"
  | "list"
  | "external"
  | "check"
  | "share"
  | "export"
  | "sync"
  | "copy"
  | "empty";

interface PrototypeIconProps {
  name: PrototypeIconName;
  size?: number;
  className?: string;
  filled?: boolean;
  dual?: boolean;
}

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function PrototypeIcon({ name, size = 16, className = "", filled = false, dual = false }: PrototypeIconProps) {
  return (
    <span
      className={[
        "mewmo-prototype-icon",
        dual ? "mewmo-prototype-icon--dual" : "",
        filled ? "mewmo-prototype-icon--filled" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {dual ? (
        <>
          <span className="mewmo-prototype-icon__line">{renderIcon(name, false)}</span>
          <span className="mewmo-prototype-icon__fill">{renderIcon(name, true)}</span>
        </>
      ) : (
        renderIcon(name, filled)
      )}
    </span>
  );
}

export function PinIcon({ size = 13 }: { size?: number }) {
  return <PrototypeIcon name="pin" size={size} filled />;
}

export function MewmoLogo({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M7 11 4 5l6 2.5M25 11l3-6-6 2.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M6.5 16a9.5 8 0 0 1 19 0v4a9.5 9 0 0 1-19 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12.5" cy="16" r="1.2" fill="currentColor" />
      <circle cx="19.5" cy="16" r="1.2" fill="currentColor" />
      <path d="M16 19v1.5M13 21.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function renderIcon(name: PrototypeIconName, filled: boolean): ReactNode {
  if (filled) return renderFilledIcon(name);
  return renderLineIcon(name);
}

function renderLineIcon(name: PrototypeIconName): ReactNode {
  switch (name) {
    case "home":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M3.5 11.5 12 4l8.5 7.5" /><path {...strokeProps} d="M6.5 10.5V20h11v-9.5" /></svg>;
    case "calendar":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M7 3v3M17 3v3" /><rect {...strokeProps} x="4" y="5" width="16" height="16" rx="3" /><path {...strokeProps} d="M8 11h8M8 15h5" /></svg>;
    case "caret":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="m8 10 4 4 4-4" /></svg>;
    case "inbox":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M4 5h16l-2 10h-4a2 2 0 0 1-4 0H6L4 5Z" /><path {...strokeProps} d="M4 15v4h16v-4" /></svg>;
    case "note":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path {...strokeProps} d="M14 3v5h5M8 13h7M8 17h5" /></svg>;
    case "bookmark":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5V21l-6-3.8L6 21z" /><path {...strokeProps} d="M9 6.5h6" /></svg>;
    case "pdf":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path {...strokeProps} d="M14 3v5h5M8 14h8" /></svg>;
    case "shelf":
    case "book":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v18H7.5A2.5 2.5 0 0 0 5 22V4.5Z" /><path {...strokeProps} d="M5 19.5A2.5 2.5 0 0 1 7.5 17H20" /></svg>;
    case "rss":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M4 11a9 9 0 0 1 9 9" /><path {...strokeProps} d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1.4" fill="currentColor" /></svg>;
    case "doc":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M6 3h12v18H6z" /><path {...strokeProps} d="M9 8h6M9 12h6M9 16h4" /></svg>;
    case "media":
      return <svg viewBox="0 0 24 24"><rect {...strokeProps} x="4" y="5" width="16" height="14" rx="2" /><path {...strokeProps} d="m10 9 5 3-5 3V9Z" /></svg>;
    case "video":
      return <svg viewBox="0 0 24 24"><rect {...strokeProps} x="3" y="6" width="13" height="12" rx="2" /><path {...strokeProps} d="m16 10 5-3v10l-5-3" /></svg>;
    case "mic":
      return <svg viewBox="0 0 24 24"><rect {...strokeProps} x="9" y="3" width="6" height="11" rx="3" /><path {...strokeProps} d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
    case "library":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M4 19.5V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-1.5Z" /><path {...strokeProps} d="M8 7h6M8 11h7" /></svg>;
    case "tag":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M4 5v6.5L12.5 20 20 12.5 11.5 4H5a1 1 0 0 0-1 1Z" /><circle cx="8" cy="8" r="1" fill="currentColor" /></svg>;
    case "trash":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></svg>;
    case "more-horizontal":
      return <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>;
    case "more-vertical":
      return <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>;
    case "plus":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M12 5v14M5 12h14" /></svg>;
    case "search":
      return <svg viewBox="0 0 24 24"><circle {...strokeProps} cx="11" cy="11" r="7" /><path {...strokeProps} d="m16 16 4 4" /></svg>;
    case "pen-new-square":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M12 3H7a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-5" /><path {...strokeProps} d="m14.5 5.5 4 4M10 14l1-4 6-6a2.8 2.8 0 0 1 4 4l-6 6z" /></svg>;
    case "chev-left":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="m15 5-6 7 6 7" /></svg>;
    case "chev-right":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="m9 5 6 7-6 7" /></svg>;
    case "expand":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M9 3H4a1 1 0 0 0-1 1v5M15 3h5a1 1 0 0 1 1 1v5M9 21H4a1 1 0 0 1-1-1v-5M15 21h5a1 1 0 0 0 1-1v-5" /></svg>;
    case "contract":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>;
    case "pin":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="m15 4 5 5-4 4v5l-4-4-6 6-2-2 6-6-4-4h5z" /></svg>;
    case "list":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M8 7h12M8 12h12M8 17h8" /><path {...strokeProps} d="M4 7h.01M4 12h.01M4 17h.01" /></svg>;
    case "external":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M14 4h6v6M20 4l-9 9" /><path {...strokeProps} d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" /></svg>;
    case "check":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="m5 12 5 5L20 7" /></svg>;
    case "share":
      return <svg viewBox="0 0 24 24"><circle {...strokeProps} cx="18" cy="5" r="3" /><circle {...strokeProps} cx="6" cy="12" r="3" /><circle {...strokeProps} cx="18" cy="19" r="3" /><path {...strokeProps} d="m8.7 10.7 6.6-4.4M8.7 13.3l6.6 4.4" /></svg>;
    case "export":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M12 15V3M8 7l4-4 4 4" /><path {...strokeProps} d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></svg>;
    case "sync":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M20 7a8 8 0 0 0-13.5-2L4 7M4 17a8 8 0 0 0 13.5 2l2.5-2" /><path {...strokeProps} d="M4 3v4h4M20 21v-4h-4" /></svg>;
    case "copy":
      return <svg viewBox="0 0 24 24"><rect {...strokeProps} x="8" y="8" width="12" height="12" rx="2" /><path {...strokeProps} d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
    case "empty":
      return <svg viewBox="0 0 24 24"><path {...strokeProps} d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5V21l-7-4-7 4z" /><path {...strokeProps} d="M9 8h6M9 12h4" /></svg>;
  }
}

function renderFilledIcon(name: PrototypeIconName): ReactNode {
  switch (name) {
    case "home":
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 3 10.8V21h6v-6h6v6h6V10.8z" /></svg>;
    case "calendar":
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v2H2V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1" /><path d="M2 11h20v7a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3zm6 2.5a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5zm0 3a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5z" /></svg>;
    case "caret":
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 9.5 12 15l5-5.5z" /></svg>;
    case "inbox":
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16l-2 11h-3.2a3 3 0 0 1-5.6 0H6z" /><path d="M4 16h4.2a4 4 0 0 0 7.6 0H20v4H4z" /></svg>;
    case "note":
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 2h7l5 5v14H7a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3m7 1.5V8h4.5zM8 13.25a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5zm0 4a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5z" /></svg>;
    case "bookmark":
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 2h7A2.5 2.5 0 0 1 18 4.5V22l-6-4-6 4V4.5A2.5 2.5 0 0 1 8.5 2M9 5.25a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 0-1.5z" /></svg>;
    case "pdf":
    case "doc":
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m8 1.5V8h4.5zM8 12.25a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5zm0 4a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5z" /></svg>;
    case "shelf":
    case "book":
    case "library":
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v18H7.5A2.5 2.5 0 0 0 5 22z" /><path d="M8 7.25h7a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1 0-1.5m0 4h8a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1 0-1.5" /></svg>;
    case "rss":
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4a16 16 0 0 1 16 16h-3A13 13 0 0 0 4 7z" /><path d="M4 10a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7z" /><circle cx="5.5" cy="18.5" r="2" /></svg>;
    case "media":
    case "video":
      return <svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="5" width="18" height="14" rx="3" /><path fill="var(--s3)" d="m10 9 6 3-6 3z" /></svg>;
    case "mic":
      return <svg viewBox="0 0 24 24" fill="currentColor"><rect x="8" y="3" width="8" height="12" rx="4" /><path d="M5 11a1 1 0 1 0-2 0 9 9 0 0 0 8 8.94V22h2v-2.06A9 9 0 0 0 21 11a1 1 0 1 0-2 0 7 7 0 1 1-14 0" /></svg>;
    case "tag":
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 5v6.5L12.5 20 20 12.5 11.5 4H5a1 1 0 0 0-1 1m4 4.2a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4" /></svg>;
    case "trash":
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h16v2H4zM9 3h6l1 2H8zM6 9h12l-1 12H7z" /></svg>;
    case "pin":
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="m19.2 7.8-3-3c-2-2-3-3-4.1-2.8s-1.6 1.6-2.6 4.3l-.7 1.8c-.3.7-.4 1.1-.6 1.4-.1.1-.2.2-.4.3-.3.2-.6.3-1.4.5-1.7.5-2.5.7-2.8 1.2s.3 1.2 1.7 2.5l1.4 1.4-4.5 4.5 1.1 1.1 4.5-4.5 1.5 1.5c1.2 1.2 1.8 1.8 2.5 1.8.6 0 .9-.4 1.1-.8.3-.5.5-1.2.8-2.4.2-.7.3-1.1.5-1.4.1-.1.2-.2.3-.3.3-.2.6-.4 1.3-.6l1.8-.7c2.7-1 4-1.5 4.2-2.6.3-1.1-.7-2.1-2.7-4.1" /></svg>;
    default:
      return renderLineIcon(name);
  }
}
