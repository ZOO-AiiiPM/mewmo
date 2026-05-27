import { useState } from 'react';
import { SourceList } from './SourceList';
import { EntryList } from './EntryList';
import { AddSourceDialog } from './AddSourceDialog';
import type { FeedEntry, SubscriptionSource } from '../types';

type Props = {
  hidden?: boolean;
  // 订阅 state 全部由 App.tsx 顶层管，本组件只渲染 list 群（不含 EntryReader）
  sources: SubscriptionSource[];
  selectedSourceId: number | null;
  onSelectSource: (id: number) => void;
  entries: FeedEntry[];
  currentEntry: FeedEntry | null;
  currentSource: SubscriptionSource | null;
  onEntrySelect: (entry: FeedEntry) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onAdd: (url: string) => Promise<void>;
};

/** 订阅 zone 的 list 群（SourceList + EntryList + AddSourceDialog）。
 * EntryReader 不在这里——它在 App.tsx reader 区 conditional 渲染（释放图片内存）。
 * 本组件永驻 DOM 用 CSS display 切换可见性，避免 list 切 zone 重新加载图片。 */
export function SubscriptionLayout({
  hidden = false,
  sources,
  selectedSourceId,
  onSelectSource,
  entries,
  currentEntry,
  currentSource,
  onEntrySelect,
  refreshing,
  onRefresh,
  onAdd,
}: Props) {
  // 添加源 Dialog 的 open 是纯 UI 状态，留组件内部
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <SourceList
        sources={sources}
        selectedId={selectedSourceId}
        onSelect={onSelectSource}
        onAdd={() => setAddOpen(true)}
        onRefresh={onRefresh}
        onManage={() => alert('源管理（US3）尚未实现，目前先在 sqlite 里手动 DELETE')}
        refreshing={refreshing}
        hidden={hidden}
      />
      <EntryList
        entries={entries}
        source={currentSource}
        selectedId={currentEntry?.id ?? null}
        onSelect={onEntrySelect}
        hidden={hidden}
      />

      <AddSourceDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={onAdd}
      />
    </>
  );
}
