"use client";

import Link from "next/link";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TopBar } from "../../../components/shell/TopBar";
import { generateClips } from "../../../lib/mock-data";

const clips = generateClips(1000);

export default function ClipsPage() {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: clips.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 68,
    overscan: 10,
  });

  return (
    <div className="flex flex-col h-screen">
      <TopBar title="Clips" action={{ label: "+ Add Clip" }} />
      <div ref={parentRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const clip = clips[virtualRow.index]!;
            return (
              <Link
                key={clip.id}
                href={`/clips/${clip.id}`}
                className="absolute left-0 right-0 px-4 py-3 rounded-md hover:bg-moss-2/50 transition-colors block"
                style={{
                  top: `${virtualRow.start}px`,
                  height: `${virtualRow.size}px`,
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted w-24 truncate">{clip.domain}</span>
                  <span className="flex-1 text-sm font-medium text-ink truncate">
                    {clip.title}
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap">
                    {new Date(clip.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-muted mt-1 ml-[108px] line-clamp-1">{clip.summary}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
