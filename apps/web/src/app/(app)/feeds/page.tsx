"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { ListColumn } from "../../../components/shell/ListColumn";
import { ReaderToolbar } from "../../../components/shell/ReaderToolbar";

interface FeedSource {
  id: string;
  url: string;
  title: string;
  description: string | null;
  unreadCount: number;
  lastFetchedAt: string | null;
}

export default function FeedsPage() {
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = feeds[0];

  async function loadFeeds() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/feeds");
    if (!response.ok) {
      setError("Could not load feeds.");
      setLoading(false);
      return;
    }

    setFeeds(await response.json());
    setLoading(false);
  }

  useEffect(() => {
    void loadFeeds();
  }, []);

  async function addFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const response = await fetch("/api/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, title }),
    });

    if (!response.ok) {
      setError("Could not add feed. Check the URL and title.");
      setSaving(false);
      return;
    }

    setUrl("");
    setTitle("");
    setFormOpen(false);
    setSaving(false);
    await loadFeeds();
  }

  return (
    <div className="mewmo-workspace">
      <ListColumn
        title="文章"
        action={
          <button
            type="button"
            className="mewmo-icon-button mewmo-icon-button--primary"
            onClick={() => setFormOpen((open) => !open)}
            aria-label={formOpen ? "Cancel adding feed" : "Add feed"}
          >
            {formOpen ? "×" : "+"}
          </button>
        }
      >
        <div className="mewmo-list-stack">
          {formOpen && (
            <form onSubmit={addFeed} className="mewmo-list-card">
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/feed.xml"
                type="url"
                required
              />
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="订阅源标题"
                required
              />
              <button type="submit" className="mewmo-icon-button mewmo-icon-button--primary" disabled={saving}>
                {saving ? "..." : "+"}
              </button>
            </form>
          )}

          {error && <p className="mewmo-list-card text-coral">{error}</p>}
          {loading && <p className="mewmo-list-card">正在加载订阅...</p>}
          {!loading && feeds.length === 0 && <p className="mewmo-list-card">还没有订阅源。</p>}

          {feeds.map((feed, index) => (
            <Link key={feed.id} href={`/feeds/${feed.id}`} className={`mewmo-list-card ${index === 0 ? "mewmo-list-card--selected" : ""}`}>
              <div className="mewmo-list-card__source">
                <span className="mewmo-favicon">{feed.title.charAt(0).toUpperCase()}</span>
                <span>{feed.title}</span>
                {feed.unreadCount > 0 && <b>{feed.unreadCount}</b>}
              </div>
              <p>{feed.description || feed.url}</p>
              <div className="mewmo-list-card__meta">
                <span className="mewmo-tag-pill">文章</span>
                <span>{feed.lastFetchedAt ? new Date(feed.lastFetchedAt).toLocaleDateString() : "未抓取"}</span>
              </div>
            </Link>
          ))}
        </div>
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar title={selected?.title ?? "订阅"} />
        <div className="mewmo-reader-scroll">
          <article className="mewmo-document mewmo-document--empty">
            <h1>{selected?.title ?? "选择一个订阅源"}</h1>
            <p>{selected?.description ?? "抓取后的文章会在阅读区打开。"}</p>
          </article>
        </div>
      </section>
    </div>
  );
}
