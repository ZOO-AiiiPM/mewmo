import Link from "next/link";
import { MewmoLogo } from "../../components/shell/PrototypeIcon";

const scenarios = [
  {
    step: "Collect",
    title: "Save without sorting.",
    body: "Clip a page, write a raw note, or subscribe to a feed. mewmo keeps the intake light so useful material does not disappear while you are still thinking.",
    meta: "Clips / RSS / notes",
    signal: "3 new items held for Today",
  },
  {
    step: "Read",
    title: "Read what is already waiting.",
    body: "The first screen is not an empty dashboard. Today brings notes, saved pages, and fresh articles into one calm queue so you can reopen context immediately.",
    meta: "Today / reader / search",
    signal: "Recent work stays warm",
  },
  {
    step: "Rediscover",
    title: "Rediscover the thread.",
    body: "The AI sidebar works beside the content, not above it. Ask about the open note, pull related clips forward, and turn old fragments into current context.",
    meta: "AI sidebar / tags / summaries",
    signal: "2 related memories found",
  },
];

export default function LandingPage() {
  return (
    <div className="mewmo-marketing-page">
      <header className="mewmo-marketing-nav">
        <Link href="/" className="mewmo-marketing-brand" aria-label="mewmo home">
          <MewmoLogo />
          <span>mewmo</span>
        </Link>
        <nav aria-label="Primary" className="mewmo-marketing-links">
          <Link href="/login">Log in</Link>
          <Link href="/register" className="mewmo-marketing-nav-cta">
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className="mewmo-marketing-hero">
          <div className="mewmo-hero-copy">
            <p className="mewmo-kicker">AI information manager</p>
            <h1>Everything worth remembering, already waiting for you.</h1>
            <p className="mewmo-hero-lede">
              mewmo collects notes, clips, feeds, and AI conversations into one fast workspace
              so your next idea starts with the context you already saved.
            </p>
            <div className="mewmo-hero-actions">
              <Link href="/register" className="mewmo-primary-cta">
                Start for free
              </Link>
              <Link href="/login" className="mewmo-secondary-cta">
                Open workspace
              </Link>
            </div>
            <div className="mewmo-hero-proof" aria-label="Product promises">
              <span>Cloud-first</span>
              <span>Fast open</span>
              <span>AI in context</span>
            </div>
          </div>

          <ProductStage />
        </section>

        <section className="mewmo-scenario-section" aria-labelledby="scenario-title">
          <div className="mewmo-section-heading">
            <p className="mewmo-kicker">Product rhythm</p>
            <h2 id="scenario-title">Save, read, and return to the ideas that still matter.</h2>
          </div>
          <div className="mewmo-scenario-list">
            {scenarios.map((item) => (
              <article key={item.step} className="mewmo-scenario-item">
                <span className="mewmo-scenario-step">{item.step}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
                <div className="mewmo-scenario-meta">
                  <span>{item.meta}</span>
                  <strong>{item.signal}</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="mewmo-marketing-footer">
        <span>mewmo</span>
        <span>Built for people who read, save, and think across sources.</span>
      </footer>
    </div>
  );
}

function ProductStage() {
  return (
    <div className="mewmo-product-stage" aria-label="mewmo product preview">
      <div className="mewmo-product-window">
        <img
          className="mewmo-product-window__image"
          src="/mewmo-workspace-preview.png"
          alt="mewmo workspace showing notes, saved items, and reader context"
        />
      </div>
      <div className="mewmo-context-rail" aria-label="AI sidebar preview">
        <img
          src="/mewmo-ai-sidebar-preview.png"
          alt="mewmo AI sidebar showing summary and related content"
        />
      </div>
    </div>
  );
}
