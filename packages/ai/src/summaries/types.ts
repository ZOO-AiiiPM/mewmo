import type { ArticleContentInput } from "../content/types";
import type { ModelClient, ModelClientOptions } from "../providers";

export type ArticleSummaryInput = ArticleContentInput;
export type SummaryContentInput = ArticleSummaryInput;

export interface SummarizeArticleOptions extends ModelClientOptions {
  prompt?: string;
  client?: ModelClient;
}

export type SummarizeContentOptions = SummarizeArticleOptions;
