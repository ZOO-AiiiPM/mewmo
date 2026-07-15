import { createQueueHelpers } from "./queues";

let helpers: ReturnType<typeof createQueueHelpers> | undefined;

function getQueueHelpers() {
  return helpers ??= createQueueHelpers();
}

export function addTagJob(...args: Parameters<ReturnType<typeof createQueueHelpers>["addTagJob"]>) {
  return getQueueHelpers().addTagJob(...args);
}

export function addSummaryJob(...args: Parameters<ReturnType<typeof createQueueHelpers>["addSummaryJob"]>) {
  return getQueueHelpers().addSummaryJob(...args);
}

export function addEmbeddingJob(...args: Parameters<ReturnType<typeof createQueueHelpers>["addEmbeddingJob"]>) {
  return getQueueHelpers().addEmbeddingJob(...args);
}
