export interface SupportedVideoUrl {
  platform: "bilibili";
  externalVideoId: string;
  canonicalUrl: string;
  feedUrl: string;
  feedTitle: string;
}

export function parseSupportedVideoUrl(value: string): SupportedVideoUrl | null {
  try {
    const url = new URL(value);
    if (!/(^|\.)bilibili\.com$/i.test(url.hostname)) return null;
    const externalVideoId = url.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/i)?.[1];
    if (!externalVideoId) return null;

    return {
      platform: "bilibili",
      externalVideoId,
      canonicalUrl: `https://www.bilibili.com/video/${externalVideoId}`,
      feedUrl: "https://www.bilibili.com",
      feedTitle: "哔哩哔哩视频",
    };
  } catch {
    return null;
  }
}
