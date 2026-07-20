import { createQueueHelpers } from "./queues";

let queueHelpers: ReturnType<typeof createQueueHelpers> | undefined;

function getQueueHelpers() {
  queueHelpers ??= createQueueHelpers();
  return queueHelpers;
}

export function addTagJob(...args: Parameters<ReturnType<typeof createQueueHelpers>["addTagJob"]>) {
  return getQueueHelpers().addTagJob(...args);
}

export function addSummaryJob(...args: Parameters<ReturnType<typeof createQueueHelpers>["addSummaryJob"]>) {
  return getQueueHelpers().addSummaryJob(...args);
}

export function addFeedFetchJob(...args: Parameters<ReturnType<typeof createQueueHelpers>["addFeedFetchJob"]>) {
  return getQueueHelpers().addFeedFetchJob(...args);
}

export function addClipFetchJob(...args: Parameters<ReturnType<typeof createQueueHelpers>["addClipFetchJob"]>) {
  return getQueueHelpers().addClipFetchJob(...args);
}

export function addEmbeddingJob(...args: Parameters<ReturnType<typeof createQueueHelpers>["addEmbeddingJob"]>) {
  return getQueueHelpers().addEmbeddingJob(...args);
}
