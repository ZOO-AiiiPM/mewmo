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
  tags_text: string;
};
