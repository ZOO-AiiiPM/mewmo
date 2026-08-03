const MAX_DETAIL_LENGTH = 240;

export function publicToolStartDetails(toolName: string, args: unknown): string[] {
  const input = record(args);
  if (!input) return [];

  if (toolName === "content_search" || toolName === "web_search") {
    return valueDetail("查询", input.query);
  }
  if (toolName === "content_read") return valueDetail("目标", input.resourceUri);
  if (toolName === "web_fetch") return valueDetail("来源", input.url);
  if (toolName === "clip_url_save" || toolName === "feed_url_subscribe") {
    return valueDetail("目标", publicHostname(input.url));
  }
  if (toolName === "read_current_context") return ["目标：当前页面内容"];
  return valueDetail("目标", input.title ?? input.name);
}

export function publicToolResultDetails(toolName: string, result: unknown, isError: boolean): string[] {
  if (isError) return ["结果：执行失败，未公开内部错误详情"];
  const wrapper = record(result);
  const details = record(wrapper?.details) ?? wrapper;
  if (!details) return ["结果：执行完成"];

  if (toolName === "clip_url_save" || toolName === "feed_url_subscribe") {
    const action = toolName === "clip_url_save" ? "剪藏" : "订阅";
    return [details.status === "existing" ? `结果：${action}已存在` : `结果：已创建${action}`];
  }

  const items = array(details.items) ?? array(details.results);
  if (items) {
    const output = [`结果：找到 ${items.length} 项`];
    const sources = items
      .map((item) => record(item))
      .map((item) => item?.title ?? item?.url)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .slice(0, 3)
      .map((value) => `来源：${clip(value)}`);
    return [...output, ...sources];
  }
  if (typeof details.finalUrl === "string") {
    return [
      ...valueDetail("结果", details.title ?? "网页读取完成"),
      ...valueDetail("来源", details.finalUrl),
    ];
  }
  if (typeof details.actionId === "string") return ["结果：已生成待确认操作"];
  if (details.available === false) return ["结果：当前页面没有可读取内容"];
  if (typeof details.title === "string") return valueDetail("结果", `已读取 ${details.title}`);
  return [`结果：${toolName === "read_current_context" ? "当前页面读取完成" : "执行完成"}`];
}

function valueDetail(label: string, value: unknown) {
  if (typeof value !== "string" || !value.trim()) return [];
  return [`${label}：${clip(value)}`];
}

function clip(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > MAX_DETAIL_LENGTH ? `${normalized.slice(0, MAX_DETAIL_LENGTH - 1)}…` : normalized;
}

function publicHostname(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function array(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}
