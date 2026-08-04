export const FILTERED_VALUE = "[Filtered]";

const SENSITIVE_KEYS = new Set([
  "arguments",
  "args",
  "auth",
  "authentication",
  "authorization",
  "body",
  "content",
  "cookie",
  "credentials",
  "email",
  "ip",
  "ipaddress",
  "password",
  "passwd",
  "prompt",
  "prompts",
  "result",
  "results",
  "query",
  "querystring",
  "search",
  "secret",
  "setcookie",
  "toolarguments",
  "toolresult",
  "toolresults",
  "username",
  "xforwardedfor",
]);

const SENSITIVE_SUFFIXES = [
  "apikey",
  "authorization",
  "body",
  "content",
  "cookie",
  "password",
  "prompt",
  "secret",
  "token",
];

const URL_BASE = "https://sentry.invalid";
const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:\/\//i;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z\d]/g, "");
}

function isSensitiveKey(key: string, parentKey?: string): boolean {
  const normalized = normalizeKey(key);
  if (normalizeKey(parentKey ?? "") === "request" && normalized === "data")
    return true;
  if (normalized === "messages" || SENSITIVE_KEYS.has(normalized)) return true;
  return SENSITIVE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function looksLikeUrl(value: string): boolean {
  return (
    (value.startsWith("/") || ABSOLUTE_URL.test(value)) && /[?#]/.test(value)
  );
}

export function stripUrlDetails(value: string): string {
  try {
    const absolute = ABSOLUTE_URL.test(value);
    const protocolRelative = value.startsWith("//");
    const url = new URL(value, URL_BASE);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";

    if (absolute) return `${url.protocol}//${url.host}${url.pathname}`;
    if (protocolRelative) return `//${url.host}${url.pathname}`;
    return url.pathname;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}

export function scrubSentryEvent<T>(event: T): T {
  const seen = new WeakSet<object>();

  function scrub(
    value: unknown,
    key?: string,
    parentKey?: string,
    depth = 0,
  ): unknown {
    if (key && isSensitiveKey(key, parentKey)) return FILTERED_VALUE;
    if (typeof value === "string")
      return looksLikeUrl(value) ? stripUrlDetails(value) : value;
    if (value === null || typeof value !== "object") return value;
    if (depth >= 12 || seen.has(value)) return FILTERED_VALUE;

    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((item) => scrub(item, undefined, key, depth + 1));
    }

    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        scrub(childValue, childKey, key, depth + 1),
      ]),
    );
  }

  return scrub(event) as T;
}

interface SentryRuntimeConfig {
  dsn?: string | undefined;
  environment?: string | undefined;
  release?: string | undefined;
}

export function createSentryOptions({
  dsn,
  environment,
  release,
}: SentryRuntimeConfig) {
  if (!dsn) return null;

  return {
    dsn,
    enabled: true,
    ...(environment ? { environment } : {}),
    ...(release ? { release } : {}),
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 5,
    },
    enableLogs: false,
    tracesSampleRate: 0.05,
    beforeSend: scrubSentryEvent,
    beforeSendSpan: scrubSentryEvent,
    beforeSendTransaction: scrubSentryEvent,
  };
}
