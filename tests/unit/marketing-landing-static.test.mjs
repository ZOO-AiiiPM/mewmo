import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = () => readFileSync("apps/web/src/app/(marketing)/page.tsx", "utf8");
const css = () => readFileSync("apps/web/src/app/globals.css", "utf8");

test("marketing landing uses a product-led hero instead of generic feature cards", () => {
  const source = page();

  assert.match(
    source,
    /className="mewmo-marketing-page"/,
    "landing should use a dedicated scrollable marketing shell",
  );
  assert.match(
    source,
    /mewmo-workspace-preview\.png/,
    "hero should use the real workspace screenshot supplied for the redesign",
  );
  assert.match(
    source,
    /className="mewmo-product-stage"/,
    "hero should frame the screenshot in a dedicated product stage",
  );
  assert.match(
    source,
    /Collect|Read|Rediscover/,
    "landing should frame the product around the collect/read/rediscover workflow",
  );
  assert.doesNotMatch(
    source,
    /grid grid-cols-1 md:grid-cols-3 gap-6/,
    "landing should not keep the previous three equal feature-card grid",
  );
});

test("marketing landing shows AI context and product scenario sections", () => {
  const source = page();

  assert.match(
    source,
    /className="mewmo-context-rail"/,
    "product hero should show the AI card on top of the workspace screenshot",
  );
  assert.match(
    source,
    /mewmo-ai-sidebar-preview\.png/,
    "AI card should use the provided AI sidebar image instead of rebuilding that UI in markup",
  );
  assert.match(
    source,
    /className="mewmo-scenario-section"/,
    "landing should continue after the hero with product scenario sections",
  );
  assert.match(
    source,
    /Save without sorting|Read what is already waiting|Rediscover the thread/,
    "scenario copy should narrate save, read, and rediscover workflows",
  );
});

test("marketing landing keeps the provided AI image inside the existing slim card frame", () => {
  const source = css();
  const railRule = source.match(/\.mewmo-context-rail\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
  const railImageRule = source.match(/\.mewmo-context-rail img\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(
    railRule,
    /width:\s*min\(252px,\s*36%\);/,
    "AI image card should be slimmer than the previous floating panel",
  );
  assert.match(
    railRule,
    /height:\s*334px;/,
    "AI image card should keep the existing overlay height",
  );
  assert.match(
    railImageRule,
    /object-fit:\s*cover;/,
    "provided tall AI sidebar image should be cropped inside the card, not recreated",
  );
  assert.match(
    source,
    /\.mewmo-context-rail\s*\{[\s\S]*?width:\s*min\(252px,\s*74vw\);[\s\S]*?height:\s*334px;[\s\S]*?overflow:\s*hidden;[\s\S]*?margin-left:\s*auto;/,
    "mobile layout should keep the AI image as a slim card instead of stretching full width",
  );
});

test("marketing landing keeps readable dark palette independent of app theme", () => {
  const source = css();
  const marketingPageRule = source.match(/\.mewmo-marketing-page\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(
    marketingPageRule,
    /--ink:\s*#ededf1;/,
    "marketing page should pin bright text instead of inheriting light-theme ink",
  );
  assert.match(
    marketingPageRule,
    /--ink-soft:\s*#9a9aa1;/,
    "marketing page should pin readable secondary text for its dark background",
  );
  assert.match(
    marketingPageRule,
    /--accent-ink:\s*#161719;/,
    "marketing primary buttons should keep dark text on bright CTA backgrounds",
  );
});
