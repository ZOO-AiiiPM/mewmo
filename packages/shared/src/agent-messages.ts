const LEGACY_PAGE_CONTEXT_PREFIX = "以下 JSON 只描述当前页面定位；正文必须通过 read_current_context 获取。\n";
const LEGACY_USER_REQUEST_MARKER = "\n用户请求：\n";

export function visibleAgentUserContent(content: string) {
  if (!content.startsWith(LEGACY_PAGE_CONTEXT_PREFIX)) return content;
  const markerIndex = content.indexOf(LEGACY_USER_REQUEST_MARKER, LEGACY_PAGE_CONTEXT_PREFIX.length);
  return markerIndex === -1 ? content : content.slice(markerIndex + LEGACY_USER_REQUEST_MARKER.length);
}
