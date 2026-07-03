"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { TopBar } from "../../../../components/shell/TopBar";

interface FeedEntry {
  id: string;
  feedId: string;
  title: string;
  url: string;
  content: string;
  summary: string | null;
  author: string | null;
  publishedAt: string | null;
  readAt: string | null;
  feed: {
    id: string;
    title: string;
    url: string;
  };
}

export default function FeedEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [entry, setEntry] = useState<FeedEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function setReadState(read: boolean) {
    const response = await fetch(`/api/feed-entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    });

    if (response.ok) {
      setEntry(await response.json());
    }
  }

  useEffect(() => {
    async function loadEntry() {
      setLoading(true);
      setError("");
      const response = await fetch(`/api/feed-entries/${id}`);
      if (!response.ok) {
        setError("Could not load this entry.");
        setLoading(false);
        return;
      }

      const nextEntry = (await response.json()) as FeedEntry;
      setEntry(nextEntry);
      setLoading(false);
      if (!nextEntry.readAt) {
        await setReadState(true);
      }
    }

    void loadEntry();
  }, [id]);

  return (
    <div className="flex h-screen flex-col">
      <TopBar title={entry?.feed.title ?? "Feed Entry"} />
      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-8">
        {loading ? (
          <p className="text-sm text-muted">Loading entry...</p>
        ) : error ? (
          <p className="rounded-md border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>
        ) : entry ? (
          <article className="space-y-5">
            <div className="space-y-2">
              <Link href={`/feeds/${entry.feedId}`} className="text-sm text-moss hover:underline">
                {entry.feed.title}
              </Link>
              <h1 className="text-3xl font-semibold tracking-normal text-ink">{entry.title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {entry.author && <span>{entry.author}</span>}
                {entry.publishedAt && <span>{new Date(entry.publishedAt).toLocaleString()}</span>}
                <a href={entry.url} target="_blank" rel="noreferrer" className="text-moss hover:underline">
                  Original
                </a>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => void setReadState(!entry.readAt)}
                className="rounded-md border border-line px-3 py-1.5 text-sm text-muted hover:bg-paper-2 hover:text-ink"
              >
                {entry.readAt ? "Mark unread" : "Mark read"}
              </button>
            </div>

            {entry.summary && <p className="rounded-md border border-line bg-paper-2 p-4 text-sm text-muted">{entry.summary}</p>}

            <div className="whitespace-pre-wrap text-base leading-7 text-ink">{entry.content || "No content was provided by this feed."}</div>
          </article>
        ) : null}
      </main>
    </div>
  );
}
