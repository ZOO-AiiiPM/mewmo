import { useCallback, useEffect, useRef, useState } from 'react';
import { SourceList } from './SourceList';
import { EntryList } from './EntryList';
import { AddSourceDialog } from './AddSourceDialog';
import {
  addSubscription,
  listEntriesForSource,
  listSourcesWithUnread,
  markEntryRead,
  refreshAllSubscriptions,
  shouldAutoRefreshOnStartup,
} from '../lib/subscription';
import type { FeedEntry, SubscriptionSource } from '../types';

type Props = {
  hidden?: boolean;
};

export function SubscriptionLayout({ hidden = false }: Props) {
  const [sources, setSources] = useState<SubscriptionSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<FeedEntry | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const initialFetchedRef = useRef(false);

  const refreshSources = useCallback(async () => {
    const list = await listSourcesWithUnread();
    setSources(list);
    return list;
  }, []);

  const refreshEntries = useCallback(async (source_id: number) => {
    const list = await listEntriesForSource(source_id);
    setEntries(list);
    return list;
  }, []);

  // 初次挂载：加载 sources + 启动检查 auto-refresh
  useEffect(() => {
    if (initialFetchedRef.current) return;
    initialFetchedRef.current = true;

    (async () => {
      try {
        const list = await refreshSources();
        setLoading(false);

        // 自动选第一个 source（如果有）
        if (list.length > 0 && selectedSourceId == null) {
          setSelectedSourceId(list[0].id);
        }

        // 启动检查：今天没抓过 → 触发 batch refresh
        if (await shouldAutoRefreshOnStartup()) {
          handleRefresh();
        }
      } catch (e) {
        console.error('[subscription] init failed:', e);
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换 source → 加载该 source 的 entries
  useEffect(() => {
    if (selectedSourceId == null) {
      setEntries([]);
      setSelectedEntry(null);
      return;
    }
    refreshEntries(selectedSourceId).then(list => {
      // 切源时不自动选条目（让用户主动点）
      if (list.length === 0) setSelectedEntry(null);
    });
  }, [selectedSourceId, refreshEntries]);

  const handleAdd = useCallback(async (url: string) => {
    const { source } = await addSubscription(url);
    await refreshSources();
    setSelectedSourceId(source.id);
  }, [refreshSources]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const summary = await refreshAllSubscriptions();
      console.log('[subscription] refresh summary:', summary);
      await refreshSources();
      if (selectedSourceId != null) {
        await refreshEntries(selectedSourceId);
      }
    } catch (e) {
      console.error('[subscription] refresh failed:', e);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, refreshSources, refreshEntries, selectedSourceId]);

  const handleEntrySelect = useCallback(async (entry: FeedEntry) => {
    setSelectedEntry(entry);
    if (entry.read_at == null) {
      await markEntryRead(entry.id);
      // 本地更新 read_at 状态
      const now = Math.floor(Date.now() / 1000);
      setEntries(prev =>
        prev.map(e => (e.id === entry.id ? { ...e, read_at: now } : e)),
      );
      await refreshSources(); // 更新 unread badge
    }
  }, [refreshSources]);

  if (loading) {
    return (
      <div className="flex-1 grid place-items-center text-stone-400 dark:text-stone-500 text-sm">
        加载中…
      </div>
    );
  }

  return (
    <>
      <SourceList
        sources={sources}
        selectedId={selectedSourceId}
        onSelect={setSelectedSourceId}
        onAdd={() => setAddOpen(true)}
        onRefresh={handleRefresh}
        onManage={() => alert('源管理（US3）尚未实现，目前先在 sqlite 里手动 DELETE')}
        refreshing={refreshing}
        hidden={hidden}
      />
      <EntryList
        entries={entries}
        selectedId={selectedEntry?.id ?? null}
        onSelect={handleEntrySelect}
        hidden={hidden}
      />
      {/* Reader 区：US2 阶段实现真实 EntryReader，先放占位 */}
      <main className="flex-1 min-w-0 flex flex-col">
        {selectedEntry ? (
          <SimpleReader entry={selectedEntry} />
        ) : (
          <div className="flex-1 grid place-items-center text-stone-400 dark:text-stone-500 text-sm px-6 text-center">
            {entries.length === 0 && sources.length > 0
              ? '此订阅源还没有内容，等下次抓取'
              : sources.length === 0
                ? '点左上 + 添加你的第一个订阅源 ✨'
                : '从中间列表点选一条阅读 ✨'}
          </div>
        )}
      </main>

      <AddSourceDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAdd}
      />
    </>
  );
}

/** US2 之前的最简阅读器：直接渲染 content_html */
function SimpleReader({ entry }: { entry: FeedEntry }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <article className="max-w-[680px] mx-auto px-8 py-10">
        <h1 className="text-[28px] font-bold leading-tight text-stone-900 dark:text-stone-100 mb-3">
          {entry.title || '无标题'}
        </h1>
        <div className="flex items-center gap-2 text-[13px] text-stone-500 dark:text-stone-400 mb-7 pb-5 border-b border-black/[0.05] dark:border-white/[0.05] flex-wrap">
          {entry.author && <span>{entry.author}</span>}
          {entry.author && entry.published_at && <span className="w-1 h-1 rounded-full bg-current opacity-50" />}
          {entry.published_at && (
            <span>
              {new Date(entry.published_at * 1000).toLocaleDateString('zh-CN', {
                year: 'numeric', month: 'long', day: 'numeric',
              })}
            </span>
          )}
          {entry.link && (
            <>
              <span className="w-1 h-1 rounded-full bg-current opacity-50" />
              <a
                href={entry.link}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                原文 ↗
              </a>
            </>
          )}
        </div>
        <div
          className="clip-prose"
          dangerouslySetInnerHTML={{ __html: entry.content_html }}
        />
      </article>
    </div>
  );
}
