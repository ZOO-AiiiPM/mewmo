export function shouldSaveMarkdownUpdate({
  ready,
  initialContent,
  markdown,
  prevMarkdown,
}: {
  ready: boolean;
  initialContent: string;
  markdown: string;
  prevMarkdown?: string;
}) {
  if (ready) return markdown !== prevMarkdown;
  const normalizedInitial = normalizeInitialMarkdown(initialContent);
  if (normalizedInitial) return false;
  return normalizeInitialMarkdown(markdown) !== normalizedInitial;
}

function normalizeInitialMarkdown(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}
