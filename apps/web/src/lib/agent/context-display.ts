/**
 * #6: shared display mapping for the note/clip/feed context chip.
 * Used by both the composer input chip (ChatInput) and the transcript
 * user-message chip (AssistantRow) so the two stay visually consistent.
 */

export function contextChipLabel(kind: string) {
  if (kind === "clip") return "剪藏";
  if (kind === "feed_entry") return "订阅文章";
  return "笔记";
}

export function contextChipIcon(kind: string) {
  if (kind === "clip") return "bookmark";
  if (kind === "feed_entry") return "rss";
  return "note";
}
