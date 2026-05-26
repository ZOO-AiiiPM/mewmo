import { useCallback, useEffect, useRef, useState } from 'react';
import { SourceList } from './SourceList';
import { EntryList } from './EntryList';
import { EntryReader } from './EntryReader';
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
  expanded: boolean;
  onExpand: () => void;
};

export function SubscriptionLayout({ hidden = false, expanded, onExpand }: Props) {
  const [sources, setSources] = useState<SubscriptionSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  // 历史栈：history 和 idx 合并成一个 state，原子更新避免双击 race
  // （分两个 state 时第二次 click 的闭包 idx 是 stale，setHistoryIdx +1 会越界让 reader 显示空）
  const [browse, setBrowse] = useState<{ history: FeedEntry[]; idx: number }>({ history: [], idx: -1 });
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
      setBrowse({ history: [], idx: -1 });
      return;
    }
    refreshEntries(selectedSourceId)
      .then(list => {
        // 切源时清空历史栈（跨源历史无意义）+ 默认打开第一条 entry。
        // 不调 handleEntrySelect / markEntryRead——保留未读 badge 让用户自己点击触发已读。
        if (list.length > 0) {
          setBrowse({ history: [list[0]], idx: 0 });
        } else {
          setBrowse({ history: [], idx: -1 });
        }
      })
      .catch(e => {
        // 加载失败时显式清空，避免新源标题下显示老源 entries 的迷惑场景
        console.error('[subscription] load entries failed:', e);
        setEntries([]);
        setBrowse({ history: [], idx: -1 });
      });
  }, [selectedSourceId, refreshEntries]);

  const handleAdd = useCallback(async (url: string) => {
    const { source } = await addSubscription(url);
    await refreshSources();
    setSelectedSourceId(source.id);
  }, [refreshSources]);

  const handleEntrySelect = useCallback(async (entry: FeedEntry) => {
    // 截断 forward 之后追加新 entry（浏览器历史经典模式）
    setBrowse(prev => {
      const truncated = prev.idx >= 0 ? prev.history.slice(0, prev.idx + 1) : [];
      // 末尾就是同一条 entry → 不入栈不动 idx（双击 / 重复点同一条）
      if (truncated.length > 0 && truncated[truncated.length - 1].id === entry.id) {
        return prev;
      }
      const nextHistory = [...truncated, entry];
      return { history: nextHistory, idx: nextHistory.length - 1 };
    });

    if (entry.read_at == null) {
      await markEntryRead(entry.id);
      const now = Math.floor(Date.now() / 1000);
      setEntries(prev =>
        prev.map(e => (e.id === entry.id ? { ...e, read_at: now } : e)),
      );
      await refreshSources(); // 更新 unread badge
    }
  }, [refreshSources]);

  const handleBack = useCallback(() => {
    setBrowse(prev => ({ ...prev, idx: Math.max(0, prev.idx - 1) }));
  }, []);

  const handleForward = useCallback(() => {
    setBrowse(prev => ({ ...prev, idx: Math.min(prev.history.length - 1, prev.idx + 1) }));
  }, []);

  // 当前显示的 entry = 历史栈当前位置
  const currentEntry = browse.idx >= 0 && browse.idx < browse.history.length
    ? browse.history[browse.idx]
    : null;
  const currentSource = selectedSourceId != null
    ? sources.find(s => s.id === selectedSourceId) ?? null
    : null;

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
        source={currentSource}
        selectedId={currentEntry?.id ?? null}
        onSelect={handleEntrySelect}
        hidden={hidden}
      />
      <EntryReader
        entry={currentEntry}
        source={currentSource}
        onBack={handleBack}
        onForward={handleForward}
        canBack={browse.idx > 0}
        canForward={browse.idx < browse.history.length - 1}
        expanded={expanded}
        onExpand={onExpand}
      />

      <AddSourceDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAdd}
      />
    </>
  );
}
