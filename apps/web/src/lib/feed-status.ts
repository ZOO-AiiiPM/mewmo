type ToastType = "success" | "loading" | "error";

interface FeedCreationStatus {
  initialFetch?: {
    status: "ok" | "skipped" | "error";
    fetched: number;
    created: number;
  };
}

interface FeedEmptyStateInput {
  feedId: string | null;
  selectedFeed: {
    lastFetchedAt: string | null;
    lastFetchStatus?: string;
    lastFetchError?: string | null;
  } | null;
  feedsLoaded?: boolean;
}

interface FeedEmptyState {
  title: string;
  detail?: string;
  canRefresh: boolean;
}

export function getFeedAddToast(feed: FeedCreationStatus): { text: string; type: ToastType } {
  if (feed.initialFetch?.status === "error") {
    return { text: "已添加订阅，首次抓取失败", type: "error" };
  }
  const created = feed.initialFetch?.created ?? 0;
  if (created > 0) {
    return { text: `已添加订阅，抓取 ${created} 篇新文章`, type: "success" };
  }
  return { text: "已添加订阅，暂无新文章", type: "success" };
}

export function getFeedEmptyState({ feedId, selectedFeed, feedsLoaded = true }: FeedEmptyStateInput): FeedEmptyState {
  if (feedId && !selectedFeed && feedsLoaded) {
    return {
      title: "这个订阅源不存在或已删除",
      detail: "请从侧栏重新选择订阅源。",
      canRefresh: false,
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
