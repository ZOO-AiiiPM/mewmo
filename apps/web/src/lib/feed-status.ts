type ToastType = "success" | "loading" | "error";

interface FeedCreationStatus {
  existing?: boolean;
  initialFetch?: {
    status: "queued" | "error";
  };
}

interface FeedEmptyStateInput {
  feedId: string | null;
  selectedFeed: {
    lastFetchedAt: string | null;
    lastFetchStatus?: string;
    lastFetchError?: string | null;
    lastFetchStartedAt?: string | null;
  } | null;
  feedsLoaded?: boolean;
  now?: Date;
}

interface FeedEmptyState {
  title: string;
  detail?: string;
  canRefresh: boolean;
}

const FEED_FETCH_STALE_MS = 60_000;

export function isFeedSyncActive(status: string | null | undefined, startedAt?: string | null, now = new Date()) {
  if (status !== "queued" && status !== "fetching") return false;
  if (!startedAt) return false;
  const startedTime = Date.parse(startedAt);
  return !Number.isNaN(startedTime) && now.getTime() - startedTime < FEED_FETCH_STALE_MS;
}

export function getFeedAddToast(feed: FeedCreationStatus): {
  text: string;
  type: ToastType;
} {
  if (feed.existing) {
    return { text: "该订阅已经添加过", type: "success" };
  }
  if (feed.initialFetch?.status === "error") {
    return { text: "订阅已保存，后台会自动重试", type: "error" };
  }
  return { text: "已添加订阅，后台会继续补全", type: "success" };
}

export function getFeedEmptyState({ feedId, selectedFeed, feedsLoaded = true, now = new Date() }: FeedEmptyStateInput): FeedEmptyState {
  if (feedId && !selectedFeed && feedsLoaded) {
    return {
      title: "这个订阅源不存在或已删除",
      detail: "请从侧栏重新选择订阅源。",
      canRefresh: false,
    };
  }

  if (feedId && isFeedSyncActive(selectedFeed?.lastFetchStatus, selectedFeed?.lastFetchStartedAt, now)) {
    return {
      title: "正在同步订阅文章",
      detail: "文章会在抓取成功后逐篇出现在这里。",
      canRefresh: false,
    };
  }

  if (feedId && (selectedFeed?.lastFetchStatus === "queued" || selectedFeed?.lastFetchStatus === "fetching")) {
    return {
      title: "订阅同步超时",
      detail: "后台抓取没有按时完成，可以重新检查更新。",
      canRefresh: true,
    };
  }

  if (feedId && selectedFeed?.lastFetchStatus === "partial") {
    return {
      title: "部分文章同步失败",
      detail: selectedFeed.lastFetchError || "已保存成功的文章，可以重试其余内容。",
      canRefresh: true,
    };
  }

  if (feedId && selectedFeed?.lastFetchStatus === "error") {
    return {
      title: "首次抓取失败",
      detail: selectedFeed.lastFetchError || "可以手动重新检查一次更新。",
      canRefresh: true,
    };
  }

  if (feedId && selectedFeed?.lastFetchedAt === null) {
    return {
      title: "正在等待首次抓取",
      detail: "首次抓取完成后，条目会自动出现在这里。",
      canRefresh: true,
    };
  }

  return {
    title: feedId ? "这个订阅源还没有条目" : "还没有订阅条目",
    detail: feedId ? "可以手动检查一次更新。" : "添加订阅源后，文章会在这里汇总。",
    canRefresh: true,
  };
}
