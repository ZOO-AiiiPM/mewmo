export interface ArticleContentInput {
  type: "clip" | "feed_entry";
  title: string;
  source?: string;
  url?: string;
  content: string;
}
