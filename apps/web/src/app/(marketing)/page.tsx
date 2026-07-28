import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MewmoLogo } from "../../components/shell/PrototypeIcon";
import { LocaleSwitcher } from "../../components/LocaleSwitcher";

export default async function LandingPage() {
  const t = await getTranslations("marketing");

  const scenarios = [
    {
      step: t("scenarios.collect.step"),
      title: t("scenarios.collect.title"),
      body: t("scenarios.collect.body"),
      meta: t("scenarios.collect.meta"),
      signal: t("scenarios.collect.signal"),
    },
    {
      step: t("scenarios.read.step"),
      title: t("scenarios.read.title"),
      body: t("scenarios.read.body"),
      meta: t("scenarios.read.meta"),
      signal: t("scenarios.read.signal"),
    },
    {
      step: t("scenarios.rediscover.step"),
      title: t("scenarios.rediscover.title"),
      body: t("scenarios.rediscover.body"),
      meta: t("scenarios.rediscover.meta"),
      signal: t("scenarios.rediscover.signal"),
    },
  ];

  return (
    <div className="mewmo-marketing-page">
      <header className="mewmo-marketing-nav">
        <Link href="/" className="mewmo-marketing-brand" aria-label="mewmo home">
          <MewmoLogo />
          <span>mewmo</span>
        </Link>
        <nav aria-label="Primary" className="mewmo-marketing-links">
          <LocaleSwitcher className="mewmo-marketing-locale" />
          <Link href="/login">{t("nav.login")}</Link>
          <Link href="/register" className="mewmo-marketing-nav-cta">
            {t("nav.getStarted")}
          </Link>
        </nav>
      </header>

      <main>
        <section className="mewmo-marketing-hero">
          <div className="mewmo-hero-copy">
            <p className="mewmo-kicker">{t("hero.kicker")}</p>
            <h1>{t("hero.title")}</h1>
            <p className="mewmo-hero-lede">{t("hero.lede")}</p>
            <div className="mewmo-hero-actions">
              <Link href="/register" className="mewmo-primary-cta">
                {t("hero.startFree")}
              </Link>
              <Link href="/login" className="mewmo-secondary-cta">
                {t("hero.openWorkspace")}
              </Link>
            </div>
            <div className="mewmo-hero-proof" aria-label="Product promises">
              <span>{t("hero.proofCloud")}</span>
              <span>{t("hero.proofFast")}</span>
              <span>{t("hero.proofAi")}</span>
            </div>
          </div>

          <ProductStage />
        </section>

        <section className="mewmo-scenario-section" aria-labelledby="scenario-title">
          <div className="mewmo-section-heading">
            <p className="mewmo-kicker">{t("scenarios.kicker")}</p>
            <h2 id="scenario-title">{t("scenarios.heading")}</h2>
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
        <span>{t("footer.tagline")}</span>
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
