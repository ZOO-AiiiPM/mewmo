"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ListColumn } from "../../../components/shell/ListColumn";
import { ReaderToolbar } from "../../../components/shell/ReaderToolbar";

interface ClipListItem {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  favicon: string | null;
  createdAt: string;
  updatedAt: string;
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function ClipsPage() {
  const router = useRouter();
  const parentRef = useRef<HTMLDivElement>(null);
  const [clips, setClips] = useState<ClipListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const firstClip = clips[0];

  useEffect(() => {
    let cancelled = false;

    async function loadClips() {
      try {
        setIsLoading(true);
        setError("");
        const res = await fetch("/api/clips");
        if (!res.ok) throw new Error("Failed to load clips");
        const data = (await res.json()) as ClipListItem[];
        if (!cancelled) setClips(data);
      } catch {
        if (!cancelled) setError("Could not load clips.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadClips();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createClipFromUrl(url: string) {
    const domain = getDomain(url);
    try {
      setError("");
      const res = await fetch("/api/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          title: domain,
          content: url,
          summary: `Saved from ${domain}`,
        }),
      });
      if (!res.ok) throw new Error("Failed to save clip");
      const clip = (await res.json()) as ClipListItem;
      setClips((current) => [clip, ...current]);
      router.push(`/clips/${clip.id}`);
    } catch {
      setError("Could not save clip.");
    }
  }

  const virtualizer = useVirtualizer({
    count: clips.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 112,
    overscan: 10,
  });

  return (
    <div className="mewmo-workspace">
      <ListColumn
        title="Clips"
        bodyRef={parentRef}
        clipUrlInput
        onSubmitClipUrl={(url) => void createClipFromUrl(url)}
      >
        {isLoading ? (
          <div className="mewmo-list-empty">Loading clips...</div>
        ) : error ? (
          <div className="mewmo-list-empty">{error}</div>
        ) : clips.length === 0 ? (
          <div className="mewmo-list-empty">No clips yet.</div>
        ) : (
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const clip = clips[virtualRow.index]!;
              const domain = getDomain(clip.url);
              return (
                <Link
                  key={clip.id}
                  href={`/clips/${clip.id}`}
                  className={`mewmo-list-card mewmo-list-card--virtual ${virtualRow.index === 0 ? "mewmo-list-card--selected" : ""}`}
                  style={{ top: `${virtualRow.start}px`, height: `${virtualRow.size}px` }}
                >
                  <div className="mewmo-list-card__source">
                    <span className="mewmo-favicon">{domain.charAt(0).toUpperCase()}</span>
                    <span>{domain}</span>
                    <time>{new Date(clip.createdAt).toLocaleDateString()}</time>
                  </div>
                  <div className="mewmo-list-card__title"><span>{clip.title}</span></div>
                  <p>{clip.summary || clip.url}</p>
                  <div className="mewmo-list-card__meta"><span className="mewmo-tag-pill">clip</span></div>
                </Link>
              );
            })}
          </div>
        )}
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar title={firstClip?.title ?? "Clips"} />
        <div className="mewmo-reader-scroll">
          <article className="mewmo-document">
            <div className="mewmo-source-strip">
              <span className="mewmo-favicon">
                {firstClip ? getDomain(firstClip.url).charAt(0).toUpperCase() : "C"}
              </span>
              <span>{firstClip ? getDomain(firstClip.url) : "Saved source"}</span>
            </div>
            <h1>{firstClip?.title ?? "Select a clip"}</h1>
            <p>{firstClip?.summary ?? "Saved articles and pages appear here."}</p>
          </article>
        </div>
      </section>
    </div>
  );
}
