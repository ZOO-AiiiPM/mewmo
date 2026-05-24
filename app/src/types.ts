export type Note = {
  id: number;
  title: string;
  content_md: string;
  tags_text: string;
  created_at: number;
  updated_at: number;
};

export type Clip = {
  id: number;
  url: string;
  title: string;
  content_md: string;
  excerpt: string;
  site_name: string;
  favicon_url: string;
  saved_at: number;
  cover_image: string;
  author: string;
  published_at: string; // ISO 8601 字符串，可能为空
  ip_region: string;    // 微信公众号 IP 属地（country 或 province），可能为空
  tags_text: string;
};

// ── 搜索 ──────────────────────────────────────────────────────────────────

export type NoteHit = {
  id: number;
  title_html: string;    // 含 <mark> 高亮
  snippet: string;       // 32 字上下文 + <mark>
  updated_at: number;
};

export type ClipHit = {
  id: number;
  title_html: string;
  site_name: string;
  author: string;
  snippet: string;
  saved_at: number;
};

export type SearchResults = {
  notes: NoteHit[];
  clips: ClipHit[];
};
