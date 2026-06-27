"use client";

import Link from "next/link";
import { TopBar } from "../../../components/shell/TopBar";
import { generateFeeds } from "../../../lib/mock-data";

const feeds = generateFeeds(10);

export default function FeedsPage() {
  return (
    <div>
      <TopBar title="Feeds" action={{ label: "+ Add Feed" }} />
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {feeds.map((feed) => (
            <Link
              key={feed.id}
              href={`/feeds/${feed.id}`}
              className="flex items-start gap-3 p-4 rounded-lg border border-line hover:border-moss/30 hover:bg-moss-2/20 transition-colors"
            >
              <div className="w-8 h-8 rounded-md bg-paper-2 border border-line flex items-center justify-center text-xs font-bold text-muted shrink-0">
                {feed.title.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink truncate">{feed.title}</span>
                  {feed.unreadCount > 0 && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-coral/10 text-coral font-medium">
                      {feed.unreadCount}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mt-1 line-clamp-2">{feed.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
