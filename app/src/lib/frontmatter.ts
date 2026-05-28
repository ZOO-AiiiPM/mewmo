/**
 * Frontmatter typed view（与 Rust 端 vault::frontmatter::FrontmatterData 对齐）
 *
 * Phase 0 stub：仅导出 type，不在前端实际解析。
 * Vault tab UI 当前只显示 vault 路径 / 三层结构信息，不渲染笔记内容，故不需要前端 parse。
 *
 * Phase 1 walking skeleton 渲染 wiki/notes/ 内容时再装 gray-matter npm（与 Rust gray_matter 双端一致）。
 */

export type FrontmatterData = {
  /** wiki page type: user-note / wiki-summary / entity / topic / report / cat-diary / todo */
  type?: string;
  created?: string; // ISO 8601 with TZ
  updated?: string;
  author?: 'user' | 'cat';
  tags?: string[];
  source?: string;
  related?: string[];
  status?: string;
  due?: string;
  slug?: string;
  /** 未识别字段（用户自定义 / 未来扩展） */
  [key: string]: unknown;
};
