"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

const navItems = [
  { href: "/notes", label: "Notes", icon: "N", count: "1k" },
  { href: "/clips", label: "Clips", icon: "C", count: "1k" },
  { href: "/feeds", label: "Feeds", icon: "R", count: "58" },
  { href: "/chat", label: "AI", icon: "A", badge: "new" },
  { href: "/settings", label: "Settings", icon: "S" },
];

export function Sidebar({ user }: { user?: SidebarUser }) {
  const pathname = usePathname();
  const initial = user?.name?.charAt(0)?.toUpperCase() ?? user?.email?.charAt(0)?.toUpperCase() ?? "U";
  const displayEmail = user?.email ?? "user@mewmo.app";

  return (
    <aside className="w-[232px] h-screen sticky top-0 flex flex-col border-r border-line bg-paper/80 backdrop-blur-xl">
      <div className="px-4 py-5">
        <span className="text-lg font-extrabold tracking-tight text-moss">
          mewmo
        </span>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                active
                  ? "bg-moss-2 text-moss font-medium"
                  : "text-ink hover:bg-paper-2"
              }`}
            >
              <span
                className={`flex items-center justify-center w-6 h-6 rounded-md border text-xs font-semibold ${
                  active
                    ? "border-moss/30 bg-moss text-white"
                    : "border-mist bg-paper-2 text-muted"
                }`}
              >
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {item.count && (
                <span className="text-xs text-muted">{item.count}</span>
              )}
              {item.badge && (
                <span className="text-[10px] bg-coral text-white px-1.5 py-0.5 rounded-full font-medium">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-line">
        <div className="flex items-center gap-2">
          {user?.image ? (
            <img src={user.image} alt="" className="w-7 h-7 rounded-full" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-moss-2 flex items-center justify-center text-xs font-medium text-moss">
              {initial}
            </div>
          )}
          <span className="text-sm text-muted truncate">{displayEmail}</span>
        </div>
      </div>
    </aside>
  );
}
