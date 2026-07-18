import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const feedsPage = readFileSync("apps/web/src/app/(app)/feeds/page.tsx", "utf8");
const sidebar = readFileSync("apps/web/src/components/shell/Sidebar.tsx", "utf8");

test("subscription page restores feed sources and per-source entries from session cache", () => {
  assert.match(feedsPage, /getCachedFeedSources<FeedSource>\(type\)/);
  assert.match(feedsPage, /getCachedFeedEntries<FeedEntry>\(initialFeedId\)/);
  assert.match(feedsPage, /loadWorkspaceResource\(`feeds:list:\$\{type\}`/);
  assert.match(feedsPage, /`feeds:entries:\$\{effectiveFeedId\}`/);
  assert.match(feedsPage, /loadWorkspaceResource\(requestKey/);
  assert.match(feedsPage, /setCachedFeedSources\(type, nextFeeds\)/);
  assert.match(feedsPage, /setCachedFeedEntries\(effectiveFeedId, nextEntries\)/);
});

test("subscription mutations keep the per-source cache consistent", () => {
  assert.match(feedsPage, /updateCachedFeedEntry<FeedEntry>\(/);
  assert.match(feedsPage, /clearCachedFeedEntries\(feed\.id\)/);
  assert.match(sidebar, /setCachedFeedSources\(\s*feed\.type/);
  assert.match(sidebar, /clearCachedFeedEntries\(feed\.id\)/);
});

test("adding a subscription notifies the mounted sidebar immediately", () => {
  assert.match(
    feedsPage,
    /onAdded=\{[\s\S]*setCachedFeedSources[\s\S]*mewmo:feed-sources-changed/,
    "the add callback should publish a source-list change after updating the shared cache",
  );
  assert.match(
    sidebar,
    /const syncFeedSources[\s\S]*getCachedFeedSources<SidebarFeed>[\s\S]*setFeeds[\s\S]*addEventListener\("mewmo:feed-sources-changed"/,
    "the mounted sidebar should apply the changed source cache without a browser refresh",
  );
});
