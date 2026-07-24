/**
 * Provider-neutral Web access ports for the Agent.
 *
 * Agent tools depend only on these interfaces; the concrete provider (Jina
 * Reader/Search today) lives behind an adapter. Swapping providers must not
 * change tool schemas or the Agent runtime.
 */

export interface WebSearchInput {
  query: string;
  limit: number;
}

export interface WebSearchHit {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
  source?: string;
}

export interface WebSearchOutput {
  results: WebSearchHit[];
}

export interface WebFetchInput {
  url: string;
  maxChars: number;
}

export interface WebFetchOutput {
  requestedUrl: string;
  finalUrl: string;
  title?: string;
  content: string;
  truncated: boolean;
  contentType?: string;
}

export interface WebPort {
  search(input: WebSearchInput): Promise<WebSearchOutput>;
  fetch(input: WebFetchInput): Promise<WebFetchOutput>;
}
