"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { ListColumn } from "../../../../components/shell/ListColumn";
import { ReaderToolbar } from "../../../../components/shell/ReaderToolbar";

interface FeedSource {
  id: string;
  title: string;
  url: string;
}

interface FeedEntry {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  author: string | null;
  publishedAt: string | null;
  readAt: string | null;
}

export default function FeedDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [feed, setFeed] = useState<FeedSource | null>(null);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const selected = entries[0];
  const parentRef = useRef<HTMLDivElement>(null);

  async function loadFeed() {
    setLoading(true);
    setError("");
    const [feedResponse, entriesResponse] = await Promise.all([
      fetch(`/api/feeds/${id}`),
      fetch(`/api/feeds/${id}/entries`),
    ]);

    if (!feedResponse.ok || !entriesResponse.ok) {
      setError("Could not load this feed.");
      setLoading(false);
      return;
    }

    setFeed(await feedResponse.json());
    setEntries(await entriesResponse.json());
    setLoading(false);
  }

  useEffect(() => {
    void loadFeed();
  }, [id]);

  async function setReadState(entryId: string, read: boolean) {
    const response = await fetch(`/api/feed-entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    });

    if (response.ok) {
      const updated = (await response.json()) as FeedEntry;
      setEntries((current) => current.map((entry) => (entry.id === entryId ? { ...entry, readAt: updated.readAt } : entry)));
    }
  }

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 86,
    overscan: 10,
  });

  return (
    <div className="mewmo-workspace">
      <ListColumn title={feed?.title ?? "Articles"} bodyRef={parentRef}>
        {loading && <p className="mewmo-list-card">Loading entries...</p>}
        {error && <p className="mewmo-list-card text-coral">{error}</p>}
        {!loading && !error && entries.length === 0 && <p className="mewmo-list-card">No entries fetched yet.</p>}

        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = entries[virtualRow.index]!;
            const isRead = Boolean(entry.readAt);
            return (
              <div
                key={entry.id}
                className={`mewmo-list-card mewmo-list-card--virtual ${virtualRow.index === 0 ? "mewmo-list-card--selected" : ""}`}
                style={{ top: `${virtualRow.start}px`, height: `${virtualRow.size}px` }}
              >
                <Link href={`/feed-entries/${entry.id}`} className="mewmo-list-card__title">
                  {!isRead && <i className="mewmo-unread-dot" />}
                  <span>{entry.title}</span>
                </Link>
                <div className="mewmo-list-card__source">
                  {entry.author && <span>{entry.author}</span>}
                  <time>{entry.publishedAt ? new Date(entry.publishedAt).toLocaleDateString() : "Undated"}</time>
                  <button type="button" onClick={() => void setReadState(entry.id, !isRead)}>
                    {isRead ? "Unread" : "Read"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar title={selected?.title ?? feed?.title ?? "Feed"} />
        <div className="mewmo-reader-scroll">
          <article className="mewmo-document">
            <div className="mewmo-source-strip">
              <span className="mewmo-favicon">{feed?.title.charAt(0).toUpperCase() ?? "R"}</span>
              <span>{feed?.title ?? "Feed"}</span>
              <time>{selected?.publishedAt ? new Date(selected.publishedAt).toLocaleDateString() : ""}</time>
            </div>
            <h1>{selected?.title ?? feed?.title ?? "Select an article"}</h1>
            <p>{selected?.summary ?? selected?.content ?? "Select an article from this feed."}</p>
          </article>
        </div>
      </section>
    </div>
  );
}
