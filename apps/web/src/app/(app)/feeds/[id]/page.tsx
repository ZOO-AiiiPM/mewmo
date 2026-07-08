"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

type FeedType = "article" | "media" | "video" | "podcast";

interface FeedSource {
  id: string;
  type?: FeedType;
}

export default function FeedDetailCompatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function redirect() {
      const response = await fetch(`/api/feeds/${id}`);
      if (!response.ok) {
        router.replace("/feeds?type=article");
        return;
      }
      const feed = (await response.json()) as FeedSource;
      if (!cancelled) router.replace(`/feeds?type=${feed.type ?? "article"}&feedId=${feed.id}`);
    }
    void redirect();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return <div className="mewmo-workspace mewmo-workspace--redirecting">正在打开订阅...</div>;
}
