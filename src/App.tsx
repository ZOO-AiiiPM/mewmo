import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Sidebar, type Zone } from './components/Sidebar';
import { TabBar, type Tab as TabPillModel } from './components/TabBar';
import { NoteList } from './components/NoteList';
import { NoteEditor } from './components/NoteEditor';
import { HtmlReader } from './components/HtmlReader';
import { ImportHtmlDialog } from './components/ImportHtmlDialog';
import { ClipInbox } from './components/ClipInbox';
import { ClipReader } from './components/ClipReader';
import { EmptyTabHome } from './components/EmptyTabHome';
import { SubscriptionLayout } from './components/SubscriptionLayout';
import { EntryReader } from './components/EntryReader';
import { listNotes, getNote, createNote, updateNote, deleteNote, pinNote } from './lib/db';
import { listClips, getClip, saveClip, deleteClip, updateClip } from './lib/db';
import {
  addSubscription,
  deleteSource,
  listEntriesForSource,
  listSourcesWithUnread,
  markEntryRead,
  refreshAllSubscriptions,
  shouldAutoRefreshOnStartup,
} from './lib/subscription';
import { SearchOverlay } from './components/SearchOverlay';
import { SettingsPanel } from './components/SettingsPanel';
import { useTheme } from './lib/useTheme';
import { cleanupOrphans } from './lib/attachments';
import { groupByBucket } from './lib/dateBuckets';
import type { Note, Clip, SubscriptionSource, FeedEntry } from './types';
import {
  canGoBack,
  canGoForward,
  currentItem,
  emptyHistory,
  goBack,
  goForward,
  pushHistory,
  type HistoryState,
} from './lib/historyStack';
import { AIPanel } from './components/AIPanel';

function resetDocumentHorizontalScroll() {
  requestAnimationFrame(() => {
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  });
}

type Tab = {
  id: string;
  zone: Zone | null;        // null = empty tab → 引导页
  refId: string | null;     // notes/clipping 时绑定的文档 id
  noteHistoryState: HistoryState<string>; // notes zone 笔记浏览历史，订阅区共用 lib/historyStack
};

const PLACEHOLDER_LABEL: Record<Zone, string> = {
  subscribe: '订阅',
  notes: '笔记',
  clipping: '剪藏',
  sediment: '沉淀',
};

export default function App() {
  const { theme, mode, setMode } = useTheme();
  const [notes, setNotes] = useState<Note[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  // 订阅 state 提到顶层（避免 SubscriptionLayout 切 zone 时 unmount 重 fetch 导致的"图片+title 闪一下"）
  const [sources, setSources] = useState<SubscriptionSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [entryBrowse, setEntryBrowse] = useState<HistoryState<FeedEntry>>(emptyHistory());
  const [refreshingSubs, setRefreshingSubs] = useState(false);
  // HTML 导入对话框 state（NoteEditor / HtmlReader toolbar 触发）
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // ── 搜索弹窗 open/close（query/results 由 SearchOverlay 自管） ────────────
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Tab 状态机 ────────────────────────────────────────────────────────────
  const [tabs, setTabs] = useState<Tab[]>([{ id: 'tab_1', zone: null, refId: null, noteHistoryState: emptyHistory<string>() }]);
  const [activeTabId, setActiveTabId] = useState<string>('tab_1');
  const tabIdSeqRef = useRef(2);
  const loadingNoteIdsRef = useRef(new Set<string>());
  const loadingClipIdsRef = useRef(new Set<string>());
  const noteContentVersionRef = useRef(new Map<string, number>());

  const activeTab = useMemo(
    () => tabs.find(t => t.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  const updateActiveTab = useCallback(
    (patch: Partial<Omit<Tab, 'id'>>) => {
      setTabs(prev =>
        prev.map(t => (t.id === activeTabId ? { ...t, ...patch } : t))
      );
    },
    [activeTabId]
  );

  const addEmptyTab = useCallback(() => {
    const id = `tab_${tabIdSeqRef.current++}`;
    setTabs(prev => [...prev, { id, zone: null, refId: null, noteHistoryState: emptyHistory<string>() }]);
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx === -1) return prev;
      const next = prev.filter(t => t.id !== id);

      if (next.length === 0) {
        const newId = `tab_${tabIdSeqRef.current++}`;
        setActiveTabId(newId);
        return [{ id: newId, zone: null, refId: null, noteHistoryState: emptyHistory<string>() }];
      }

      // 关掉的是 active：跳到右邻，无右则左邻
      if (id === activeTabId) {
        const neighbor = next[idx] ?? next[idx - 1] ?? next[0];
        setActiveTabId(neighbor.id);
      }
      return next;
    });
  }, [activeTabId]);

  // ── 数据加载 ──────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const list = await listNotes();
    setNotes(list);
    return list;
  }, []);

  const refreshClips = useCallback(async () => {
    const list = await listClips();
    setClips(list);
    return list;
  }, []);

  const mergeRefreshNotes = useCallback(async () => {
    const fresh = await listNotes();
    setNotes(prev => {
      const byId = new Map(prev.map(n => [n.id, n]));
      return fresh.map(f => {
        const ex = byId.get(f.id);
        return ex?.content_loaded ? { ...f, content_md: ex.content_md, content_loaded: true } : f;
      });
    });
  }, []);

  const mergeRefreshClips = useCallback(async () => {
    const fresh = await listClips();
    setClips(prev => {
      const byId = new Map(prev.map(c => [c.id, c]));
      return fresh.map(f => {
        const ex = byId.get(f.id);
        return ex?.content_loaded ? { ...f, content_md: ex.content_md, content_loaded: true } : f;
      });
    });
  }, []);

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

  useEffect(() => {
    // notes + clips + sources 必须都加载完再关 loading；否则 setLoading(false) 可能在某个还没回来时触发，
    // 用户立刻切到对应 zone 会看到短暂"空白"或刷新闪一下。
    Promise.all([refresh(), refreshClips(), refreshSources()])
      .then(async ([, , sourcesList]) => {
        // 自动选第一个 source（如果有）→ 触发下面 entries effect
        if (sourcesList.length > 0) {
          setSelectedSourceId(prev => prev ?? sourcesList[0].id);
        }
        // 启动检查：今天没抓过 → 触发 batch refresh（异步、不 block 关闭 loading）
        if (await shouldAutoRefreshOnStartup()) {
          (async () => {
            try {
              await refreshAllSubscriptions();
              await refreshSources();
            } catch (e) {
              console.error('[subscription] startup refresh failed:', e);
            }
          })();
        }
        cleanupOrphans()
          .then(n => { if (n > 0) console.log(`[cleanup] removed ${n} orphan attachments`); })
          .catch(e => console.error('[cleanup] failed:', e));
      })
      .catch(e => console.error('[init] data load failed:', e))
      .finally(() => setLoading(false));
  }, [refresh, refreshClips, refreshSources]);

  useEffect(() => {
    const unlisten = listen<{ notes?: boolean; clips?: boolean }>('vault-changed', e => {
      if (e.payload?.notes) mergeRefreshNotes();
      if (e.payload?.clips) mergeRefreshClips();
    });
    return () => { unlisten.then(un => un()); };
  }, [mergeRefreshNotes, mergeRefreshClips]);


  // 切 source → 拉对应 entries + 默认打开第一条
  useEffect(() => {
    if (selectedSourceId == null) {
      setEntries([]);
      setEntryBrowse(emptyHistory());
      return;
    }
    refreshEntries(selectedSourceId)
      .then(list => {
        if (list.length > 0) {
          setEntryBrowse({ history: [list[0]], idx: 0 });
        } else {
          setEntryBrowse(emptyHistory());
        }
      })
      .catch(e => {
        console.error('[subscription] load entries failed:', e);
        setEntries([]);
        setEntryBrowse(emptyHistory());
      });
  }, [selectedSourceId, refreshEntries]);

  const handleSubscriptionRefresh = useCallback(async () => {
    if (refreshingSubs) return;
    setRefreshingSubs(true);
    try {
      await refreshAllSubscriptions();
      await refreshSources();
      if (selectedSourceId != null) {
        await refreshEntries(selectedSourceId);
      }
    } catch (e) {
      console.error('[subscription] refresh failed:', e);
    } finally {
      setRefreshingSubs(false);
    }
  }, [refreshingSubs, refreshSources, refreshEntries, selectedSourceId]);

  const handleSubscriptionAdd = useCallback(async (url: string) => {
    const { source } = await addSubscription(url);
    await refreshSources();
    setSelectedSourceId(source.id);
  }, [refreshSources]);

  const handleDeleteSource = useCallback(async (id: number) => {
    await deleteSource(id);
    await refreshSources();
    // 如果删的是当前选中的源 → 清掉 selected（EntryList useEffect 会跟随清 entries）
    setSelectedSourceId(prev => (prev === id ? null : prev));
  }, [refreshSources]);

  const handleEntrySelect = useCallback(async (entry: FeedEntry) => {
    setEntryBrowse(prev => pushHistory(prev, entry, (a, b) => a.id === b.id));
    if (entry.read_at == null) {
      await markEntryRead(entry.id);
      const now = Math.floor(Date.now() / 1000);
      setEntries(prev => prev.map(e => (e.id === entry.id ? { ...e, read_at: now } : e)));
      await refreshSources(); // 更新 unread badge
    }
  }, [refreshSources]);

  const handleEntryBack = useCallback(() => setEntryBrowse(goBack), []);
  const handleEntryForward = useCallback(() => setEntryBrowse(goForward), []);

  // 订阅 zone 当前显示的 entry / source（derive 一次，传给 list 群和 EntryReader）
  const currentEntry = currentItem(entryBrowse);
  const currentSource = selectedSourceId != null
    ? sources.find(s => s.id === selectedSourceId) ?? null
    : null;
  const entryCanBack = canGoBack(entryBrowse);
  const entryCanForward = canGoForward(entryBrowse);

  const ensureNoteLoaded = useCallback(async (id: string) => {
    if (loadingNoteIdsRef.current.has(id)) return;
    const current = notes.find(n => n.id === id);
    if (!current || current.content_loaded) return;

    loadingNoteIdsRef.current.add(id);
    try {
      const full = await getNote(id);
      if (!full) return;
      setNotes(prev => prev.map(n => (n.id === id ? full : n)));
    } catch (e) {
      console.error('[notes] load failed:', e);
    } finally {
      loadingNoteIdsRef.current.delete(id);
    }
  }, [notes]);

  const ensureClipLoaded = useCallback(async (id: string) => {
    if (loadingClipIdsRef.current.has(id)) return;
    const current = clips.find(c => c.id === id);
    if (!current || current.content_loaded) return;

    loadingClipIdsRef.current.add(id);
    try {
      const full = await getClip(id);
      if (!full) return;
      setClips(prev => prev.map(c => (c.id === id ? full : c)));
    } catch (e) {
      console.error('[clips] load failed:', e);
    } finally {
      loadingClipIdsRef.current.delete(id);
    }
  }, [clips]);

  // ── AI 面板 ───────────────────────────────────────────────────────────────
  const toggleAI = useCallback(() => setAiOpen(prev => !prev), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        toggleAI();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleAI]);

  // 搜索：debounce 200ms 调 search_all（已迁移到 SearchOverlay 内部，App 不再持有）
  // ⌘K 全局快捷键：唤起搜索弹窗
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOverlayOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── 笔记操作 ──────────────────────────────────────────────────────────────
  // 刚创建的笔记 id 标记：仅 NoteEditor 切到这条时触发 fade 动画，用完即清
  // （单纯靠"内容空"反推会误命中其他空笔记，必须显式信号）
  const [newlyCreatedNoteId, setNewlyCreatedNoteId] = useState<string | null>(null);
  const consumeNewlyCreated = useCallback(() => setNewlyCreatedNoteId(null), []);

  const handleCreateAndBind = useCallback(async () => {
    const id = await createNote();
    // 不调 refresh()——refresh 把所有笔记 content_md 重置成 list 模式（content_loaded=false, content_md=''）
    // 会覆盖用户在另一条笔记里已编辑但还没 flush 的 in-memory 内容。
    // 改 optimistic prepend：直接把新笔记 mock 进 list 头部（title 用 slug 当 macOS 风格 file stem 显示）
    const now = Math.floor(Date.now() / 1000);
    setNotes(prev => [
      {
        id,
        title: id,
        content_md: '',
        content_loaded: true,
        tags_text: '',
        created_at: now,
        updated_at: now,
        format: 'md',
        pinned: false,
      },
      ...prev,
    ]);
    setTabs(prev =>
      prev.map(t => {
        if (t.id !== activeTabId) return t;
        return { ...t, zone: 'notes', refId: id, noteHistoryState: pushHistory(t.noteHistoryState, id) };
      })
    );
    setNewlyCreatedNoteId(id);
  }, [activeTabId]);

  const handleUpdateNote = useCallback(
    async (patch: { title?: string; content_md?: string }, targetNoteId?: string) => {
      // 切笔记的 race：NoteEditor 在切换前 flush 旧 note 的 pending 时显式传旧 id，
      // 避免 onChange 默认走 activeTab.refId（已是新 id）把内容写到新笔记
      const noteId = targetNoteId ?? (
        activeTab?.zone === 'notes' && activeTab.refId != null ? activeTab.refId : null
      );
      if (noteId == null) return;
      const contentVersionAtSave = patch.content_md !== undefined
        ? (noteContentVersionRef.current.get(noteId) ?? 0)
        : null;
      // 后端可能因 title 改 rename 文件 → slug 变 → 返回新 slug，前端 state/history 跟着替
      const newSlug = await updateNote(noteId, patch);
      const slugChanged = newSlug !== noteId;
      if (slugChanged) {
        const version = noteContentVersionRef.current.get(noteId);
        if (version !== undefined) {
          noteContentVersionRef.current.set(newSlug, version);
          noteContentVersionRef.current.delete(noteId);
        }
      }
      setNotes(prev =>
        prev.map(n =>
          n.id === noteId
            ? (() => {
                const nextPatch = { ...patch };
                if (
                  contentVersionAtSave !== null &&
                  (noteContentVersionRef.current.get(newSlug) ?? noteContentVersionRef.current.get(noteId) ?? 0) > contentVersionAtSave
                ) {
                  delete nextPatch.content_md;
                }
                return {
                  ...n,
                  ...nextPatch,
                  id: newSlug,
                  content_loaded: n.content_loaded || patch.content_md !== undefined,
                  updated_at: Math.floor(Date.now() / 1000),
                };
              })()
            : n
        )
      );
      if (slugChanged) {
        setTabs(prev =>
          prev.map(t => {
            if (t.zone !== 'notes') return t;
            return {
              ...t,
              refId: t.refId === noteId ? newSlug : t.refId,
              noteHistoryState: {
                ...t.noteHistoryState,
                history: t.noteHistoryState.history.map(h => (h === noteId ? newSlug : h)),
              },
            };
          })
        );
        setNewlyCreatedNoteId(prev => (prev === noteId ? newSlug : prev));
      }
    },
    [activeTab]
  );

  const handleLocalNoteContentChange = useCallback((id: string, content_md: string) => {
    noteContentVersionRef.current.set(id, (noteContentVersionRef.current.get(id) ?? 0) + 1);
    setNotes(prev =>
      prev.map(n =>
        n.id === id
          ? {
              ...n,
              content_md,
              content_loaded: true,
            }
          : n
      )
    );
  }, []);

  const handleDeleteNote = useCallback(
    async (id: string) => {
      // 删除前 capture 邻接 id（按当前列表顺序——更新时间倒序）：
      // 优先下一项；如果删的是末尾就用上一项；列表只剩它自己 → null
      const oldIdx = notes.findIndex(n => n.id === id);
      const fallbackId =
        oldIdx === -1 ? null : (notes[oldIdx + 1]?.id ?? notes[oldIdx - 1]?.id ?? null);

      await deleteNote(id);
      const list = await refresh();
      // 防御：确认 fallback 还在新列表里
      const nextId = fallbackId != null && list.some(n => n.id === fallbackId) ? fallbackId : null;

      setTabs(prev =>
        prev.map(t => {
          if (!(t.zone === 'notes' && t.refId === id)) return t;
          if (nextId == null) return { ...t, refId: null };
          // 切到 nextId 同时入历史栈，保持后退可用
          return { ...t, refId: nextId, noteHistoryState: pushHistory(t.noteHistoryState, nextId) };
        })
      );
      cleanupOrphans().catch(e => console.error('[cleanup] failed:', e));
    },
    [notes, refresh]
  );

  const handlePinNote = useCallback(async (id: string, pinned: boolean) => {
    await pinNote(id, pinned);
    await refresh();
  }, [refresh]);

  // ── 剪藏操作 ──────────────────────────────────────────────────────────────
  type FetchedClip = {
    url: string; title: string; content_md: string;
    excerpt: string; site_name: string; favicon_url: string;
    cover_image: string; author: string; published_at: string;
    ip_region: string;
  };

  const handleClipSave = useCallback(async (url: string) => {
    const fetched = await invoke<FetchedClip>('fetch_clip', { url });
    const id = await saveClip(fetched);
    const [freshClips, fullClip] = await Promise.all([
      listClips(),
      getClip(id),
    ]);
    setClips(fullClip
      ? freshClips.map(c => (c.id === id ? fullClip : c))
      : freshClips
    );
    setTabs(prev =>
      prev.map(t => (t.id === activeTabId ? { ...t, zone: 'clipping', refId: id } : t))
    );
    resetDocumentHorizontalScroll();
  }, [activeTabId]);

  const handleClipDelete = useCallback(async (id: string) => {
    await deleteClip(id);
    await refreshClips();
    setTabs(prev =>
      prev.map(t =>
        t.zone === 'clipping' && t.refId === id ? { ...t, refId: null } : t
      )
    );
  }, [refreshClips]);

  const handleClipRefetch = useCallback(async (id: string, url: string) => {
    const fetched = await invoke<FetchedClip>('fetch_clip', { url });
    await updateClip(id, fetched);
    await refreshClips();
  }, [refreshClips]);

  // ── 派生：当前 tab 视图 ───────────────────────────────────────────────────
  const activeZone = activeTab?.zone ?? null;
  const selectedNote =
    activeTab?.zone === 'notes' && activeTab.refId != null
      ? notes.find(n => n.id === activeTab.refId) ?? null
      : null;
  const selectedClip =
    activeTab?.zone === 'clipping' && activeTab.refId != null
      ? clips.find(c => c.id === activeTab.refId) ?? null
      : null;
  const selectedNoteReady = selectedNote?.content_loaded ? selectedNote : null;
  const selectedClipReady = selectedClip?.content_loaded ? selectedClip : null;

  useEffect(() => {
    if (selectedNote && !selectedNote.content_loaded) {
      ensureNoteLoaded(selectedNote.id);
    }
  }, [selectedNote, ensureNoteLoaded]);

  useEffect(() => {
    if (selectedClip && !selectedClip.content_loaded) {
      ensureClipLoaded(selectedClip.id);
    }
  }, [selectedClip, ensureClipLoaded]);

  // 笔记列表上一篇 / 下一篇：按视觉顺序（groupByBucket 展平）
  const noteVisualOrder = useMemo(
    () => groupByBucket(notes, n => n.created_at).flatMap(g => g.items),
    [notes]
  );
  const noteIdx = selectedNote ? noteVisualOrder.findIndex(n => n.id === selectedNote.id) : -1;
  const hasNotePrev = noteIdx > 0;
  const hasNoteNext = noteIdx >= 0 && noteIdx < noteVisualOrder.length - 1;
  const notePrev = useCallback(() => {
    if (noteIdx > 0) {
      const id = noteVisualOrder[noteIdx - 1].id;
      setTabs(prev => prev.map(t =>
        t.id !== activeTabId ? t : { ...t, zone: 'notes', refId: id, noteHistoryState: pushHistory(t.noteHistoryState, id) }
      ));
    }
  }, [noteIdx, noteVisualOrder, activeTabId]);
  const noteNext = useCallback(() => {
    if (noteIdx >= 0 && noteIdx < noteVisualOrder.length - 1) {
      const id = noteVisualOrder[noteIdx + 1].id;
      setTabs(prev => prev.map(t =>
        t.id !== activeTabId ? t : { ...t, zone: 'notes', refId: id, noteHistoryState: pushHistory(t.noteHistoryState, id) }
      ));
    }
  }, [noteIdx, noteVisualOrder, activeTabId]);

  const counts: Record<Zone, number> = {
    subscribe: 0,
    notes: notes.length,
    clipping: clips.length,
    sediment: 0,
  };

  // tab pill：title 实时从 notes/clips 派生
  const tabPills: TabPillModel[] = useMemo(() => {
    return tabs.map(t => {
      let title = '新建';
      if (t.zone === 'notes') {
        const n = t.refId != null ? notes.find(x => x.id === t.refId) : null;
        title = n ? (n.title || '无标题') : PLACEHOLDER_LABEL.notes;
      } else if (t.zone === 'clipping') {
        const c = t.refId != null ? clips.find(x => x.id === t.refId) : null;
        title = c ? (c.title || '无标题') : PLACEHOLDER_LABEL.clipping;
      } else if (t.zone === 'subscribe' || t.zone === 'sediment') {
        title = PLACEHOLDER_LABEL[t.zone];
      }
      return { id: t.id, title, zone: t.zone };
    });
  }, [tabs, notes, clips]);

  // ── 事件桥 ────────────────────────────────────────────────────────────────
  const handleSidebarSelect = useCallback((zone: Zone) => {
    // 已有该 zone 的 tab → 切换过去
    const existing = tabs.find(t => t.zone === zone);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    // 没有 → 新增 tab
    const id = `tab_${tabIdSeqRef.current++}`;
    const newTab: Tab = zone === 'notes' && notes.length > 0
      ? { id, zone, refId: notes[0].id, noteHistoryState: pushHistory(emptyHistory<string>(), notes[0].id) }
      : { id, zone, refId: null, noteHistoryState: emptyHistory<string>() };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
  }, [tabs, notes]);

  const handleEmptyPick = useCallback((zone: Zone) => {
    updateActiveTab({ zone, refId: null });
  }, [updateActiveTab]);

  const handleNoteSelect = useCallback((id: string) => {
    setTabs(prev =>
      prev.map(t => {
        if (t.id !== activeTabId) return t;
        return { ...t, zone: 'notes', refId: id, noteHistoryState: pushHistory(t.noteHistoryState, id) };
      })
    );
  }, [activeTabId]);


  const handleClipSelect = useCallback((id: string) => {
    updateActiveTab({ zone: 'clipping', refId: id });
  }, [updateActiveTab]);

  // 剪藏列表上一条 / 下一条：按视觉顺序（groupByBucket 展平）走，避免 mtime≠saved_at 时跳过
  const clipVisualOrder = useMemo(
    () => groupByBucket(clips, c => c.saved_at).flatMap(g => g.items),
    [clips]
  );
  const clipIdx = selectedClip ? clipVisualOrder.findIndex(c => c.id === selectedClip.id) : -1;
  const hasClipPrev = clipIdx > 0;
  const hasClipNext = clipIdx >= 0 && clipIdx < clipVisualOrder.length - 1;
  const clipPrev = useCallback(() => {
    if (clipIdx > 0) handleClipSelect(clipVisualOrder[clipIdx - 1].id);
  }, [clipIdx, clipVisualOrder, handleClipSelect]);
  const clipNext = useCallback(() => {
    if (clipIdx >= 0 && clipIdx < clipVisualOrder.length - 1) handleClipSelect(clipVisualOrder[clipIdx + 1].id);
  }, [clipIdx, clipVisualOrder, handleClipSelect]);

  // 进 clipping zone 且无选中 → 自动选第一条
  useEffect(() => {
    if (activeTab?.zone === 'clipping' && activeTab.refId == null && clips.length > 0) {
      handleClipSelect(clips[0].id);
    }
  }, [activeTab?.zone, activeTab?.refId, clips, handleClipSelect]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-stone-400 text-sm">
        加载中…
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden relative">
      <TabBar
        tabs={tabPills}
        activeId={activeTabId}
        onSelect={setActiveTabId}
        onClose={closeTab}
        onAddNew={addEmptyTab}
      />
      <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
        <Sidebar
          open={sidebarOpen}
          hidden={expanded}
          onToggle={() => setSidebarOpen(o => !o)}
          active={activeZone}
          onSelect={handleSidebarSelect}
          counts={counts}
          onSearchClick={() => setSearchOverlayOpen(true)}
          onSettingsClick={() => setSettingsOpen(true)}
        />

        {/* 主内容区：relative 是 AIPanel 的浮层定位锚点 */}
        <main className="flex-1 relative min-w-0">
          {/* Layer 2：Content card（list + main 合并的圆角白卡，右/下 flush window 边缘）。
              结构：list 群永驻（避免切 zone 销毁 list DOM 导致 favicon 重新加载），
                  reader 区 conditional（释放正文图片内存）。 */}
          <div className="h-full flex min-w-0 bg-white dark:bg-stone-900 rounded-tl-2xl overflow-hidden shadow-[0_2px_16px_rgba(0,0,0,0.07),0_0_0_0.5px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_16px_rgba(0,0,0,0.4),0_0_0_0.5px_rgba(255,255,255,0.05)]">
            {/* 永驻 list 群：用 display 切换可见性，DOM 不销毁。
                fragment 不能挂 style，所以每个 list zone 用一个 wrapper div + display:contents/none */}
            <div style={{ display: activeZone === 'clipping' ? 'contents' : 'none' }}>
              <ClipInbox
                clips={clips}
                selectedId={selectedClip?.id ?? null}
                onSelect={handleClipSelect}
                onDelete={handleClipDelete}
                hidden={expanded}
              />
            </div>
            <div style={{ display: activeZone === 'notes' ? 'contents' : 'none' }}>
              <NoteList
                notes={notes}
                selectedId={selectedNote?.id ?? null}
                onSelect={handleNoteSelect}
                onCreate={handleCreateAndBind}
                onDelete={handleDeleteNote}
                onPin={handlePinNote}
                hidden={expanded}
              />
            </div>
            <div style={{ display: activeZone === 'subscribe' ? 'contents' : 'none' }}>
              <SubscriptionLayout
                hidden={expanded}
                sources={sources}
                selectedSourceId={selectedSourceId}
                onSelectSource={setSelectedSourceId}
                entries={entries}
                currentEntry={currentEntry}
                currentSource={currentSource}
                onEntrySelect={handleEntrySelect}
                refreshing={refreshingSubs}
                onRefresh={handleSubscriptionRefresh}
                onAdd={handleSubscriptionAdd}
                onDeleteSource={handleDeleteSource}
              />
            </div>

            {/* Reader 区：conditional unmount 让正文 img DOM 销毁 → 释放 decoded 图片内存 */}
            {activeZone === null ? (
              <EmptyTabHome onPick={handleEmptyPick} />
            ) : activeZone === 'clipping' ? (
              <ClipReader
                clip={selectedClipReady}
                aiOpen={aiOpen}
                onRefetch={handleClipRefetch}
                onDelete={handleClipDelete}
                onSave={handleClipSave}
                onPrev={clipPrev}
                onNext={clipNext}
                hasPrev={hasClipPrev}
                hasNext={hasClipNext}
                expanded={expanded}
                onExpand={() => setExpanded(e => !e)}
              />
            ) : activeZone === 'notes' ? (
              selectedNoteReady?.format === 'html' ? (
                <HtmlReader
                  note={selectedNoteReady}
                  aiOpen={aiOpen}
                  expanded={expanded}
                  onExpand={() => setExpanded(e => !e)}
                  onDelete={() => selectedNote && handleDeleteNote(selectedNote.id)}
                  onCreate={handleCreateAndBind}
                  onImport={() => setImportDialogOpen(true)}
                  canBack={hasNotePrev}
                  canForward={hasNoteNext}
                  onBack={notePrev}
                  onForward={noteNext}
                />
              ) : (
                <NoteEditor
                  note={selectedNoteReady}
                  onChange={handleUpdateNote}
                  onLocalContentChange={handleLocalNoteContentChange}
                  theme={theme}
                  onDelete={() => selectedNote && handleDeleteNote(selectedNote.id)}
                  onCreate={handleCreateAndBind}
                  onImport={() => setImportDialogOpen(true)}
                  aiOpen={aiOpen}
                  expanded={expanded}
                  onExpand={() => setExpanded(e => !e)}
                  canBack={hasNotePrev}
                  canForward={hasNoteNext}
                  onBack={notePrev}
                  onForward={noteNext}
                  newlyCreatedId={newlyCreatedNoteId}
                  onCreateAnimDone={consumeNewlyCreated}
                />
              )
            ) : activeZone === 'subscribe' ? (
              <EntryReader
                entry={currentEntry}
                source={currentSource}
                onBack={handleEntryBack}
                onForward={handleEntryForward}
                canBack={entryCanBack}
                canForward={entryCanForward}
                expanded={expanded}
                onExpand={() => setExpanded(e => !e)}
                onClipSave={handleClipSave}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-stone-400 dark:text-stone-500 text-sm">
                {PLACEHOLDER_LABEL[activeZone]} 敬请期待
              </div>
            )}
          </div>

          {/* Layer 3：AI 浮层（绝对定位浮在 content card 之上）。
              永久挂着 + open 控制 transform/opacity，否则首次 toggle 没起点状态 → 无 transition */}
          <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
            <AIPanel
              open={aiOpen}
              currentNote={activeZone === 'notes' ? selectedNoteReady : null}
              currentClip={activeZone === 'clipping' ? selectedClipReady : null}
              zone={activeZone}
            />
          </div>
        </main>
      </div>

      {/* 全局浮动 AI toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleAI();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        title="AI 助手 (⌘J)"
        className={`absolute top-1 right-2 z-50 w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
          aiOpen
            ? 'bg-black/[0.10] dark:bg-white/[0.12] text-stone-900 dark:text-stone-100'
            : 'text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2 14 8l6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />
        </svg>
      </button>

      {/* 全局搜索浮层：searchOverlayOpen 控制 open/close */}
      <SearchOverlay
        open={searchOverlayOpen}
        notes={notes}
        clips={clips}
        onPickNote={(id) => {
          updateActiveTab({ zone: 'notes', refId: id });
          setSearchOverlayOpen(false);
        }}
        onPickClip={(id) => {
          updateActiveTab({ zone: 'clipping', refId: id });
          setSearchOverlayOpen(false);
        }}
        onClose={() => setSearchOverlayOpen(false)}
      />

      {/* HTML 导入对话框：NoteEditor / HtmlReader toolbar 触发 */}
      <ImportHtmlDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImported={async () => {
          await refresh();
        }}
      />

      {/* 设置面板 */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        mode={mode}
        onModeChange={setMode}
      />
    </div>
  );
}
