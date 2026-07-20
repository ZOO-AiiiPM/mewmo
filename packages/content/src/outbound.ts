import { lookup as connectionLookup } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";

const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface ResolvedAddress {
  address: string;
  family: number;
}

export interface OutboundFetchOptions {
  fetchImpl?: OutboundFetch;
  lookupHost?: (hostname: string) => Promise<ResolvedAddress[]>;
  connectLookup?: LookupFunction;
  maxRedirects?: number;
  allowedPrivateOrigins?: string[];
}

type OutboundFetchInit = RequestInit & { dispatcher: Dispatcher };
type OutboundFetch = (input: URL, init: OutboundFetchInit) => Promise<Response>;

export class UnsafeOutboundUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeOutboundUrlError";
  }
}

export async function fetchOutbound(
  input: string,
  init: RequestInit = {},
  options: OutboundFetchOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? (undiciFetch as unknown as OutboundFetch);
  const lookupHost = options.lookupHost ?? defaultLookupHost;
  const connectLookup = options.connectLookup ?? connectionLookup;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const allowedPrivateOrigins = new Set(
    (options.allowedPrivateOrigins ?? []).map((origin) => parseUrl(origin).origin),
  );
  let currentUrl = parseUrl(input);

  for (let redirects = 0; ; redirects += 1) {
    await assertSafeOutboundUrl(currentUrl, lookupHost, allowedPrivateOrigins);
    const allowPrivateConnection = allowedPrivateOrigins.has(currentUrl.origin);
    const dispatcher = new Agent({
      connect: { lookup: createSafeConnectLookup(connectLookup, allowPrivateConnection) },
    });
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, { ...init, redirect: "manual", dispatcher });
    } catch (error) {
      await dispatcher.close();
      if (error instanceof Error && error.cause instanceof UnsafeOutboundUrlError) {
        throw error.cause;
      }
      throw error;
    }
    const location = response.headers.get("location");

    if (!REDIRECT_STATUSES.has(response.status) || !location) {
      void dispatcher.close().catch(() => dispatcher.destroy());
      return response;
    }
    if (redirects >= maxRedirects) {
      await response.body?.cancel();
      await dispatcher.close();
      throw new UnsafeOutboundUrlError(`Too many redirects while fetching ${input}`);
    }

    await response.body?.cancel();
    await dispatcher.close();
    currentUrl = parseUrl(new URL(location, currentUrl).href);
  }
}

function createSafeConnectLookup(lookupImpl: LookupFunction, allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    lookupImpl(hostname, options, (error, address, family) => {
      if (error) {
        callback(error, address, family);
        return;
      }

      try {
        if (!allowPrivate) {
          const addresses = Array.isArray(address) ? address : [{ address, family: family ?? isIP(address) }];
          assertPublicAddresses(addresses);
        }
        callback(null, address, family);
      } catch (unsafeAddressError) {
        callback(unsafeAddressError as NodeJS.ErrnoException, address, family);
      }
    });
  };
}

async function assertSafeOutboundUrl(
  url: URL,
  lookupHost: (hostname: string) => Promise<ResolvedAddress[]>,
  allowedPrivateOrigins: ReadonlySet<string>,
) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeOutboundUrlError(`Unsupported outbound URL protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new UnsafeOutboundUrlError("Outbound URLs must not contain credentials");
  }

  const hostname = stripIpv6Brackets(url.hostname).toLowerCase();
  if (allowedPrivateOrigins.has(url.origin)) return;
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new UnsafeOutboundUrlError(`Outbound URL hostname is blocked: ${hostname || "empty"}`);
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookupHost(hostname);
  if (addresses.length === 0) {
    throw new UnsafeOutboundUrlError(`Outbound URL hostname did not resolve: ${hostname}`);
  }

  assertPublicAddresses(addresses);
}

function assertPublicAddresses(addresses: ResolvedAddress[]) {
  for (const { address } of addresses) {
    if (!ipaddr.isValid(address) || ipaddr.parse(address).range() !== "unicast") {
      throw new UnsafeOutboundUrlError(`Outbound URL resolved to a blocked address: ${address}`);
    }
  }
}

async function defaultLookupHost(hostname: string): Promise<ResolvedAddress[]> {
  return lookup(hostname, { all: true, verbatim: true });
}

function parseUrl(input: string) {
  try {
    return new URL(input);
  } catch {
    throw new UnsafeOutboundUrlError("Invalid outbound URL");
  }
}

function stripIpv6Brackets(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}
