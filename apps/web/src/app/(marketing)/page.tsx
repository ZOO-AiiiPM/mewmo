import { Check, FilePenLine, Globe2, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "../../components/LocaleSwitcher";
import {
  MarketingCapabilitySection,
  MarketingDemo,
  type MarketingDemoCopy,
  type MarketingTabItem,
} from "../../components/marketing/MarketingShowcase";
import { MewmoLogo } from "../../components/shell/PrototypeIcon";

const GITHUB_URL = "https://github.com/ZOO-AiiiPM/mewmo";

export default async function LandingPage() {
  const t = await getTranslations("marketing");
  const demo = buildDemoCopy(t);
  const basics = buildTabs(t, "basics", ["note", "clip", "feed", "library"]);
  const workflows = buildTabs(t, "workflows", ["summary", "insight", "related"]);
  const heroPreview = basics[0]?.preview;

  return (
    <div className="mewmo-marketing-page">
      <header className="mewmo-marketing-nav">
        <Link href="/" className="mewmo-marketing-brand" aria-label={t("nav.homeLabel")}>
          <MewmoLogo />
          <span className="mewmo-marketing-brand-name">mewmo</span>
        </Link>
        <nav aria-label={t("nav.ariaLabel")} className="mewmo-marketing-links">
          <LocaleSwitcher className="mewmo-marketing-locale" />
          <Link href="/login">{t("nav.login")}</Link>
          <Link href="/register" className="mewmo-marketing-nav-cta">{t("nav.register")}</Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="mewmo-marketing-github">
            <span>GitHub</span>
          </a>
        </nav>
      </header>

      <main>
        <section className="mewmo-marketing-hero" aria-labelledby="mewmo-hero-title">
          <div className="mewmo-hero-copy">
            <MewmoLogo className="mewmo-hero-logo" />
            <h1 id="mewmo-hero-title">mewmo</h1>
            <p>{t("hero.slogan")}</p>
          </div>
          {heroPreview && <MarketingDemo preview={heroPreview} copy={demo} hero />}
        </section>

        <MarketingCapabilitySection id="capabilities" items={basics} demo={demo} tone="white" />
        <MarketingCapabilitySection id="workflows" items={workflows} demo={demo} tone="gray" />

        <section className="mewmo-agent" aria-labelledby="mewmo-agent-title">
          <div className="mewmo-agent__heading">
            <span className="mewmo-agent__mark">m</span>
            <p>{t("agent.name")}</p>
            <h2 id="mewmo-agent-title">{t("agent.title")}</h2>
          </div>

          <div className="mewmo-agent-run" aria-label={t("agent.runLabel")}>
            <div className="mewmo-agent-run__context">
              <span>{t("agent.contextLabel")}</span>
              <strong>{demo.documentTitle}</strong>
              <p>{t("agent.prompt")}</p>
            </div>
            <ol className="mewmo-agent-run__steps">
              <li><Search aria-hidden="true" /><span>{t("agent.steps.knowledge")}</span><small>{t("agent.steps.knowledgeDetail")}</small></li>
              <li><Globe2 aria-hidden="true" /><span>{t("agent.steps.web")}</span><small>{t("agent.steps.webDetail")}</small></li>
              <li><Sparkles aria-hidden="true" /><span>{t("agent.steps.insight")}</span><small>{t("agent.steps.insightDetail")}</small></li>
              <li><FilePenLine aria-hidden="true" /><span>{t("agent.steps.write")}</span><small>{t("agent.steps.writeDetail")}</small></li>
            </ol>
            <div className="mewmo-agent-run__confirm">
              <div><Check aria-hidden="true" /><span>{t("agent.previewLabel")}</span></div>
              <strong>{t("agent.previewTitle")}</strong>
              <p>{t("agent.previewBody")}</p>
              <button type="button" tabIndex={-1}>{t("agent.confirm")}</button>
            </div>
          </div>

          <div className="mewmo-agent-roadmap">
            <div className="mewmo-agent-roadmap__intro">
              <span>{t("agent.upcoming")}</span>
              <h3>{t("agent.roadmapTitle")}</h3>
            </div>
            <ol>
              <li><span>01</span><strong>{t("agent.roadmap.memory.title")}</strong><p>{t("agent.roadmap.memory.body")}</p></li>
              <li><span>02</span><strong>{t("agent.roadmap.skills.title")}</strong><p>{t("agent.roadmap.skills.body")}</p></li>
              <li><span>03</span><strong>{t("agent.roadmap.proactive.title")}</strong><p>{t("agent.roadmap.proactive.body")}</p></li>
            </ol>
          </div>
        </section>

        <section className="mewmo-marketing-final" aria-labelledby="mewmo-final-title">
          <h2 id="mewmo-final-title">{t("final.title")}</h2>
          <Link href="/register" className="mewmo-primary-cta">{t("final.cta")}</Link>
        </section>
      </main>

      <footer className="mewmo-marketing-footer">
        <span>mewmo</span>
        <span>{t("footer.tagline")}</span>
      </footer>
    </div>
  );
}

function buildTabs(
  t: Awaited<ReturnType<typeof getTranslations<"marketing">>>,
  group: "basics" | "workflows",
  ids: Array<"note" | "clip" | "feed" | "library" | "summary" | "insight" | "related">,
): MarketingTabItem[] {
  return ids.map((id) => ({
    id,
    label: t(`${group}.${id}.label`),
    title: t(`${group}.${id}.title`),
    body: t(`${group}.${id}.body`),
    preview: {
      kind: id,
      eyebrow: t(`${group}.${id}.preview.eyebrow`),
      title: t(`${group}.${id}.preview.title`),
      body: t(`${group}.${id}.preview.body`),
      meta: t(`${group}.${id}.preview.meta`),
    },
  }));
}

function buildDemoCopy(t: Awaited<ReturnType<typeof getTranslations<"marketing">>>): MarketingDemoCopy {
  return {
    name: t("demo.name"),
    today: t("demo.today"),
    notes: t("demo.notes"),
    clips: t("demo.clips"),
    feeds: t("demo.feeds"),
    knowledgeBases: t("demo.knowledgeBases"),
    libraryName: t("demo.libraryName"),
    documentTitle: t("demo.documentTitle"),
    documentIntro: t("demo.documentIntro"),
    documentPointOne: t("demo.documentPointOne"),
    documentPointTwo: t("demo.documentPointTwo"),
    documentPointThree: t("demo.documentPointThree"),
    mew: t("demo.mew"),
    mewPrompt: t("demo.mewPrompt"),
    mewReply: t("demo.mewReply"),
  };
}
