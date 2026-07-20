import { extractArticleFromHtml, fetchArticleFromUrl } from "@mewmo/content";

import { integrationFixtureOrigins } from "./content-fetch-runtime";

export const extractClipFromHtml = extractArticleFromHtml;

export function fetchClipFromUrl(url: string) {
  const allowedPrivateOrigins = integrationFixtureOrigins();
  return fetchArticleFromUrl(url, {
    ...(allowedPrivateOrigins ? { allowedPrivateOrigins } : {}),
  });
}
