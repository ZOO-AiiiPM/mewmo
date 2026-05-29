export type Note = {
  id: string;
  title: string;
  content_md: string;
  content_loaded?: boolean;
  tags_text: string;
  created_at: number;
  updated_at: number;
  /** 'md' = 标准 markdown 笔记（NoteEditor）；'html' = 外部 HTML 文件导入（HtmlReader 只读渲染） */
  format: 'md' | 'html';
};

export type Clip = {
  id: string;
  url: string;
  title: string;
  content_md: string;
  content_loaded?: boolean;
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
  id: string;
  title_html: string;    // 含 <mark> 高亮
  snippet: string;       // 32 字上下文 + <mark>
  updated_at: number;
};

export type ClipHit = {
  id: string;
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

// ── 订阅 ──────────────────────────────────────────────────────────────────

export type SourceStatus = 'ok' | 'unhealthy' | 'pending';

export interface SubscriptionSource {
  id: number;
  feed_url: string;
  title: string;
  description: string;
  site_url: string | null;
  favicon_url: string | null;
  etag: string | null;
  last_modified: string | null;
  last_content_hash: string | null;
  last_fetched_at: number | null;
  consecutive_failure_count: number;
  status: SourceStatus;
  status_detail: string | null;
  added_at: number;
  unread_count?: number; // 由 listSourcesWithUnread 填充
}

export interface FeedEntry {
  id: number;
  source_id: number;
  guid: string;
  title: string;
  content_html: string;
  excerpt: string;
  link: string | null;
  author: string;
  published_at: number | null;
  fetched_at: number;
  read_at: number | null;
}

// 与 Rust 端 FetchOutcome / FetchedEntry / FetchedFeedMeta 对齐
export interface FetchedFeedMeta {
  title: string;
  description: string;
  site_url: string | null;
  favicon_url: string | null;
}

export interface FetchedEntry {
  guid: string;
  title: string;
  content_html: string;
  excerpt: string;
  link: string | null;
  author: string;
  published_at: number | null;
}

export type FetchOutcome =
  | { status: 'not_modified' }
  | {
      status: 'updated';
      feed_meta: FetchedFeedMeta;
      entries: FetchedEntry[];
      etag: string | null;
      last_modified: string | null;
    };
