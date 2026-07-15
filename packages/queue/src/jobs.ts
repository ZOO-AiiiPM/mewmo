import { createQueueHelpers } from "./queues";

export function addTagJob(...args: Parameters<ReturnType<typeof createQueueHelpers>["addTagJob"]>) {
  return createQueueHelpers().addTagJob(...args);
}

export function addSummaryJob(...args: Parameters<ReturnType<typeof createQueueHelpers>["addSummaryJob"]>) {
  return createQueueHelpers().addSummaryJob(...args);
}

export function addEmbeddingJob(...args: Parameters<ReturnType<typeof createQueueHelpers>["addEmbeddingJob"]>) {
  return createQueueHelpers().addEmbeddingJob(...args);
}
