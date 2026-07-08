export function proxiedImageUrl(src: string | null | undefined): string {
  const value = src?.trim();
  if (!value) return "";
  if (/^(?:data:image\/|blob:|asset:)/i.test(value)) return value;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return value;
    return `/api/image-proxy?url=${encodeURIComponent(url.href)}`;
  } catch {
    return value;
  }
}
