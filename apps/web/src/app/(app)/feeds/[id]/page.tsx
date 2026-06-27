"use client";

import { use, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TopBar } from "../../../../components/shell/TopBar";
import { generateFeedEntries, generateFeeds } from "../../../../lib/mock-data";

const feeds = generateFeeds(10);

export default function FeedDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const feed = feeds.find((f) => f.id === id) ?? feeds[0]!;
  const entries = generateFeedEntries(feed.id, 1000);

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  return (
    <div className="flex flex-col h-screen">
      <TopBar title={feed.title} />
      <div ref={parentRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = entries[virtualRow.index]!;
            return (
              <div
                key={entry.id}
                className="absolute left-0 right-0 flex items-center gap-3 px-4 py-3 rounded-md hover:bg-moss-2/50 transition-colors cursor-pointer"
                style={{
                  top: `${virtualRow.start}px`,
                  height: `${virtualRow.size}px`,
                }}
              >
                {!entry.isRead && (
                  <span className="w-2 h-2 rounded-full bg-coral shrink-0" />
                )}
                {entry.isRead && <span className="w-2 shrink-0" />}
                <span
                  className={`flex-1 text-sm truncate ${entry.isRead ? "text-muted" : "text-ink font-medium"}`}
                >
                  {entry.title}
                </span>
                <span className="text-xs text-muted whitespace-nowrap">{entry.author}</span>
                <span className="text-xs text-muted whitespace-nowrap">
                  {new Date(entry.publishedAt).toLocaleDateString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
