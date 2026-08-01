"use client";

import {
  Bookmark,
  FileText,
  FolderOpen,
  Library,
  Lightbulb,
  Rss,
  Search,
  Sparkles,
} from "lucide-react";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

export type MarketingPreviewKind =
  | "note"
  | "clip"
  | "feed"
  | "library"
  | "summary"
  | "insight"
  | "related";

export type MarketingTabItem = {
  id: string;
  label: string;
  title: string;
  body: string;
  preview: {
    kind: MarketingPreviewKind;
    eyebrow: string;
    title: string;
    body: string;
    meta: string;
  };
};

export type MarketingDemoCopy = {
  name: string;
  today: string;
  notes: string;
  clips: string;
  feeds: string;
  knowledgeBases: string;
  libraryName: string;
  documentTitle: string;
  documentIntro: string;
  documentPointOne: string;
  documentPointTwo: string;
  documentPointThree: string;
  mew: string;
  mewPrompt: string;
  mewReply: string;
};

export function MarketingCapabilitySection({
  id,
  items,
  demo,
  tone,
}: {
  id: string;
  items: MarketingTabItem[];
  demo: MarketingDemoCopy;
  tone: "white" | "gray";
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const tabSetId = useId();
  const activeIndex = Math.max(0, items.findIndex((item) => item.id === activeId));
  const active = items[activeIndex];

  if (!active) return null;

  function moveFocus(nextIndex: number) {
    const next = items[(nextIndex + items.length) % items.length];
    if (!next) return;
    setActiveId(next.id);
    requestAnimationFrame(() => {
      document.getElementById(`${tabSetId}-${next.id}-tab`)?.focus();
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      moveFocus(activeIndex + 1);
    } else if (["ArrowUp", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      moveFocus(activeIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(items.length - 1);
    }
  }

  return (
    <section id={id} className={`mewmo-capabilities mewmo-capabilities--${tone}`}>
      <div className="mewmo-capabilities__inner">
        <div className="mewmo-capability-tabs" role="tablist" aria-orientation="vertical">
          {items.map((item) => {
            const selected = item.id === active.id;
            return (
              <button
                key={item.id}
                id={`${tabSetId}-${item.id}-tab`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${tabSetId}-${item.id}-panel`}
                tabIndex={selected ? 0 : -1}
                className="mewmo-capability-tab"
                onClick={() => setActiveId(item.id)}
                onKeyDown={handleKeyDown}
              >
                <span>{item.label}</span>
                <span aria-hidden="true">{selected ? "-" : "+"}</span>
              </button>
            );
          })}
        </div>

        <div
          key={active.id}
          id={`${tabSetId}-${active.id}-panel`}
          role="tabpanel"
          aria-labelledby={`${tabSetId}-${active.id}-tab`}
          className="mewmo-capability-panel"
        >
          <div className="mewmo-capability-copy">
            <h2>{active.title}</h2>
            <p>{active.body}</p>
          </div>
          <MarketingDemo preview={active.preview} copy={demo} />
        </div>
      </div>
    </section>
  );
}

export function MarketingDemo({
  preview,
  copy,
  hero = false,
}: {
  preview: MarketingTabItem["preview"];
  copy: MarketingDemoCopy;
  hero?: boolean;
}) {
  const activeNav = navKeyForPreview(preview.kind);
  const showMew = hero || ["summary", "insight", "related"].includes(preview.kind);

  return (
    <div className={`mewmo-demo ${hero ? "mewmo-demo--hero" : ""}`} aria-label={copy.name}>
      <div className="mewmo-demo__bar">
        <span className="mewmo-demo__window-controls" aria-hidden="true"><i /><i /><i /></span>
        <strong>{copy.name}</strong>
        <span className="mewmo-demo__search"><Search size={13} /> <span>{copy.documentTitle}</span></span>
      </div>
      <div className={`mewmo-demo__workspace ${showMew ? "mewmo-demo__workspace--mew" : ""}`}>
        <aside className="mewmo-demo__nav" aria-hidden="true">
          <div className="mewmo-demo__nav-brand"><span>m</span><b>mewmo</b></div>
          <DemoNavItem active={activeNav === "today"} icon={<Sparkles />} label={copy.today} />
          <DemoNavItem active={activeNav === "notes"} icon={<FileText />} label={copy.notes} />
          <DemoNavItem active={activeNav === "clips"} icon={<Bookmark />} label={copy.clips} />
          <DemoNavItem active={activeNav === "feeds"} icon={<Rss />} label={copy.feeds} />
          <DemoNavItem active={activeNav === "library"} icon={<Library />} label={copy.knowledgeBases} />
          <div className="mewmo-demo__library"><FolderOpen size={13} /><span>{copy.libraryName}</span></div>
        </aside>
        <div className="mewmo-demo__content">
          <DemoDocument preview={preview} copy={copy} />
        </div>
        {showMew && (
          <aside className="mewmo-demo__mew">
            <div className="mewmo-demo__mew-title"><span>m</span><strong>{copy.mew}</strong></div>
            <div className="mewmo-demo__bubble mewmo-demo__bubble--user">{copy.mewPrompt}</div>
            <div className="mewmo-demo__thinking"><Sparkles size={13} />{preview.eyebrow}</div>
            <div className="mewmo-demo__bubble">{hero ? copy.mewReply : preview.body}</div>
          </aside>
        )}
      </div>
    </div>
  );
}

function DemoNavItem({ active, icon, label }: { active: boolean; icon: ReactNode; label: string }) {
  return <div className={`mewmo-demo__nav-item ${active ? "is-active" : ""}`}>{icon}<span>{label}</span></div>;
}

function DemoDocument({ preview, copy }: { preview: MarketingTabItem["preview"]; copy: MarketingDemoCopy }) {
  if (preview.kind === "library") {
    return (
      <div className="mewmo-demo__library-view">
        <span className="mewmo-demo__eyebrow">{preview.eyebrow}</span>
        <h3>{preview.title}</h3>
        <div className="mewmo-demo__folders"><span>{copy.documentPointOne}</span><span>{copy.documentPointTwo}</span><span>{copy.documentPointThree}</span></div>
        <div className="mewmo-demo__library-note"><FileText size={15} /><div><b>{copy.documentTitle}</b><small>{preview.meta}</small></div></div>
      </div>
    );
  }

  if (preview.kind === "feed") {
    return (
      <div className="mewmo-demo__feed-view">
        <div className="mewmo-demo__feed-list">
          <span className="mewmo-demo__eyebrow">{preview.eyebrow}</span>
          {[preview.title, copy.documentPointOne, copy.documentPointTwo].map((title, index) => <div className={index === 0 ? "is-active" : ""} key={title}><b>{title}</b><small>{preview.meta}</small></div>)}
        </div>
        <DemoArticle preview={preview} copy={copy} />
      </div>
    );
  }

  return <DemoArticle preview={preview} copy={copy} />;
}

function DemoArticle({ preview, copy }: { preview: MarketingTabItem["preview"]; copy: MarketingDemoCopy }) {
  const automated = ["summary", "insight", "related"].includes(preview.kind);
  return (
    <article className={`mewmo-demo__document mewmo-demo__document--${preview.kind}`}>
      <div className="mewmo-demo__document-head">
        <span className="mewmo-demo__eyebrow">{preview.eyebrow}</span>
        <span>{preview.meta}</span>
      </div>
      <h3>{preview.title}</h3>
      <p>{preview.body}</p>
      {preview.kind === "note" ? (
        <>
          <h4>## {copy.documentIntro}</h4>
          <ul><li>{copy.documentPointOne}</li><li>{copy.documentPointTwo}</li><li>{copy.documentPointThree}</li></ul>
          <span className="mewmo-demo__cursor" aria-hidden="true" />
        </>
      ) : (
        <>
          <div className="mewmo-demo__prose-lines" aria-hidden="true"><i /><i /><i /><i /></div>
          {automated && <div className="mewmo-demo__automation"><Lightbulb size={15} /><span>{copy.mewReply}</span></div>}
        </>
      )}
    </article>
  );
}

function navKeyForPreview(kind: MarketingPreviewKind) {
  if (kind === "note" || kind === "insight") return "notes";
  if (kind === "clip" || kind === "summary") return "clips";
  if (kind === "feed" || kind === "related") return "feeds";
  if (kind === "library") return "library";
  return "today";
}
