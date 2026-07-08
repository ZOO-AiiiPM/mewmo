"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

type FeedType = "article" | "media" | "video" | "podcast";

interface FeedEntry {
  id: string;
  feedId: string;
  feed?: {
    type?: FeedType;
  };
}

export default function FeedEntryCompatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function redirect() {
      const response = await fetch(`/api/feed-entries/${id}`);
      if (!response.ok) {
        router.replace("/feeds?type=article");
        return;
      }
      const entry = (await response.json()) as FeedEntry;
      if (!cancelled) {
        router.replace(`/feeds?type=${entry.feed?.type ?? "article"}&feedId=${entry.feedId}&entryId=${entry.id}`);
      }
    }
    void redirect();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return <div className="mewmo-workspace mewmo-workspace--redirecting">正在打开订阅条目...</div>;
}
