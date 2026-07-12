const trackingParameters = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
]);

function isTrackingParameter(name: string) {
  const lower = name.toLowerCase();
  return lower.startsWith("utm_") || trackingParameters.has(lower);
}

export function normalizeClipUrlIdentity(value: string) {
  const url = new URL(value.trim());
  url.hash = "";

  for (const name of [...url.searchParams.keys()]) {
    if (isTrackingParameter(name)) url.searchParams.delete(name);
  }
  url.searchParams.sort();

  const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  const search = url.searchParams.size > 0 ? `?${url.searchParams.toString()}` : "";
  return `${url.host.toLowerCase()}${pathname}${search}`;
}
