import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = () => readFileSync("apps/web/src/app/(marketing)/page.tsx", "utf8");
const showcase = () => readFileSync("apps/web/src/components/marketing/MarketingShowcase.tsx", "utf8");
const localeSwitcher = () => readFileSync("apps/web/src/components/LocaleSwitcher.tsx", "utf8");
const css = () => readFileSync("apps/web/src/app/globals.css", "utf8");
const messages = (locale) => JSON.parse(readFileSync(`apps/web/messages/${locale}.json`, "utf8")).marketing;

test("hero stays direct and uses the controlled Demo workspace", () => {
  const source = page();

  assert.match(source, /<h1 id="mewmo-hero-title">mewmo<\/h1>/);
  assert.match(source, /t\("hero\.slogan"\)/);
  assert.match(source, /<MarketingDemo[\s\S]*hero/);
  assert.doesNotMatch(source, /hero\.(lede|startFree|seeProduct|proof)/);
  assert.doesNotMatch(source, /mewmo-workspace-preview\.png|mewmo-ai-sidebar-preview\.png/);
});

test("capability tabs preserve the approved order and defaults", () => {
  const source = page();
  const client = showcase();

  assert.match(source, /\["note", "clip", "feed", "library"\]/);
  assert.match(source, /\["summary", "insight", "related"\]/);
  assert.match(client, /useState\(items\[0\]\?\.id/);
  assert.match(client, /role="tablist"/);
  assert.match(client, /role="tabpanel"/);
  assert.match(client, /ArrowDown/);
  assert.match(client, /ArrowRight/);

  assert.deepEqual(Object.keys(messages("zh").basics), ["note", "clip", "feed", "library"]);
  assert.deepEqual(Object.keys(messages("zh").workflows), ["summary", "insight", "related"]);
});

test("Agent presents current actions separately from the upcoming roadmap", () => {
  const source = page();
  const zh = messages("zh");
  const en = messages("en");

  assert.match(source, /mewmo-agent-run__steps/);
  assert.match(source, /agent\.steps\.knowledge/);
  assert.match(source, /agent\.steps\.web/);
  assert.match(source, /agent\.steps\.insight/);
  assert.match(source, /agent\.steps\.write/);
  assert.match(source, /agent\.confirm/);
  assert.equal(zh.agent.upcoming, "即将支持");
  assert.equal(en.agent.upcoming, "Coming soon");
  assert.match(zh.agent.roadmap.skills.body, /Skill.*Automation/);
  assert.match(zh.agent.roadmap.proactive.body, /日报和周报/);
});

test("navigation uses a globe and keeps GitHub rightmost in a new tab", () => {
  const source = page();
  const locale = localeSwitcher();
  const navStart = source.indexOf("<nav");
  const navEnd = source.indexOf("</nav>", navStart);
  const nav = source.slice(navStart, navEnd);

  assert.match(locale, /import \{ Globe2 \} from "lucide-react"/);
  assert.doesNotMatch(locale, />文<|>A</);
  assert.ok(nav.indexOf("LocaleSwitcher") < nav.indexOf('href="/login"'));
  assert.ok(nav.indexOf('href="/login"') < nav.indexOf('href="/register"'));
  assert.ok(nav.indexOf('href="/register"') < nav.indexOf("GITHUB_URL"));
  assert.match(nav, /target="_blank"/);
  assert.match(source, /https:\/\/github\.com\/ZOO-AiiiPM\/mewmo/);
  assert.doesNotMatch(nav, /nav\.product|#workflow/);
});

test("marketing translations stay aligned and never restore removed labels", () => {
  const zh = messages("zh");
  const en = messages("en");

  assert.deepEqual(Object.keys(zh), Object.keys(en));
  assert.deepEqual(Object.keys(zh.basics), Object.keys(en.basics));
  assert.deepEqual(Object.keys(zh.workflows), Object.keys(en.workflows));
  assert.doesNotMatch(JSON.stringify(zh), /标签/);
  assert.doesNotMatch(JSON.stringify(en), /\btags?\b/i);
});

test("homepage and App light theme use neutral surfaces", () => {
  const source = css();
  const marketingRule = source.match(/\/\* Marketing homepage:[\s\S]*?@media \(prefers-reduced-motion: reduce\)/)?.[0] ?? "";
  const lightRule = source.match(/html\.light\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  for (const color of ["#0a0a0a", "#ffffff", "#f2f2f2", "#111111", "#6f6f6f", "#d8d8d8"]) {
    assert.match(marketingRule, new RegExp(color));
  }
  assert.doesNotMatch(marketingRule, /linear-gradient|radial-gradient|#f8f4ed|#f5ecd9/i);
  for (const color of ["#f7f7f7", "#ffffff", "#f1f1f1", "#e8e8e8", "#d8d8d8"]) {
    assert.match(lightRule, new RegExp(color));
  }
  assert.doesNotMatch(lightRule, /#f8f4ed|#f7f2e7|#f5ecd9|#eae3d8|#f4efe6/i);
});
