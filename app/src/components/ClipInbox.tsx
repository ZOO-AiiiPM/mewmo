import { useEffect, useRef, useState } from 'react';
import type { Clip } from '../types';
import { BUCKET_LABEL, formatListItemDate, groupByBucket } from '../lib/dateBuckets';
import { ListItemContextMenu } from './ListItemContextMenu';
import { ConfirmDialog } from './ConfirmDialog';

type Props = {
  clips: Clip[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onPin?: (id: string, pinned: boolean) => void;
  hidden?: boolean;
};

export function ClipInbox({ clips, selectedId, onSelect, onDelete, onPin, hidden = false }: Props) {
  const pinnedClips = clips.filter(c => c.pinned);
  const unpinnedClips = clips.filter(c => !c.pinned);
  const groups = groupByBucket(unpinnedClips, c => c.saved_at);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmClip = clips.find(c => c.id === confirmId) ?? null;

  return (
    <aside
      style={{ width: hidden ? 0 : undefined }}
      className={`shrink-0 border-r border-black/[0.1] dark:border-white/[0.1] flex flex-col overflow-hidden transition-[width] duration-200 ease-out ${hidden ? '' : 'w-[261px]'}`}
    >
      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {clips.length === 0 ? (
          <div className="p-6 text-center text-stone-500 dark:text-stone-400 text-[13px] leading-relaxed">
            <div className="mb-1.5 text-2xl">🔗</div>
            <div>还没有剪藏</div>
            <div className="text-stone-400 dark:text-stone-500 text-[11px] mt-1">
              在右上角点 ⊕ 添加链接
            </div>
          </div>
        ) : (
          <>
            {pinnedClips.length > 0 && (
              <section>
                <h2 className="sticky top-0 z-10 h-12 px-3 flex items-center justify-between text-[15px] font-semibold text-stone-800 dark:text-stone-100 bg-white/70 dark:bg-stone-900/70 backdrop-blur-md select-none">
                  <div className="absolute bottom-0 left-3 right-1 h-px bg-black/[0.1] dark:bg-white/[0.1]" />
                  <span>置顶</span>
                  <span className="text-[11px] font-normal text-stone-400 dark:text-stone-500 tabular-nums">
                    {pinnedClips.length}
                  </span>
                </h2>
                {pinnedClips.map(c => (
                  <ClipItem
                    key={c.id}
                    clip={c}
                    bucket="today"
                    active={selectedId === c.id}
                    onSelect={onSelect}
                    onRequestDelete={onDelete ? (id) => setConfirmId(id) : undefined}
                    onPin={onPin}
                  />
                ))}
              </section>
            )}
            {groups.map((g, idx) => (
              <section key={g.bucket}>
                <h2 className="sticky top-0 z-10 h-12 px-3 flex items-center justify-between text-[15px] font-semibold text-stone-800 dark:text-stone-100 bg-white/70 dark:bg-stone-900/70 backdrop-blur-md select-none">
                  {(idx > 0 || pinnedClips.length > 0) && <div className="absolute top-0 left-3 right-1 h-px bg-black/[0.1] dark:bg-white/[0.1]" />}
                  <div className="absolute bottom-0 left-3 right-1 h-px bg-black/[0.1] dark:bg-white/[0.1]" />
                  <span>{BUCKET_LABEL[g.bucket]}</span>
                  <span className="text-[11px] font-normal text-stone-400 dark:text-stone-500 tabular-nums">
                    {g.items.length}
                  </span>
                </h2>
                {g.items.map(c => (
                  <ClipItem
                    key={c.id}
                    clip={c}
                    bucket={g.bucket}
                    active={selectedId === c.id}
                    onSelect={onSelect}
                    onRequestDelete={onDelete ? (id) => setConfirmId(id) : undefined}
                    onPin={onPin}
                  />
                ))}
              </section>
            ))}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="删除这条剪藏？"
        description={confirmClip?.title ? `「${confirmClip.title}」将被永久删除` : '该剪藏将被永久删除'}
        confirmLabel="删除"
        variant="danger"
        onConfirm={() => {
          if (confirmId !== null) onDelete?.(confirmId);
          setConfirmId(null);
        }}
        onCancel={() => setConfirmId(null)}
      />
    </aside>
  );
}

function ClipItem({
  clip,
  bucket,
  active,
  onSelect,
  onRequestDelete,
  onPin,
}: {
  clip: Clip;
  bucket: ReturnType<typeof groupByBucket>[number]['bucket'];
  active: boolean;
  onSelect: (id: string) => void;
  onRequestDelete?: (id: string) => void;
  onPin?: (id: string, pinned: boolean) => void;
}) {
  const titleRef = useRef<HTMLDivElement>(null);
  const [titleOverflow, setTitleOverflow] = useState(false);

  // 标题超过 2 行才挂 fade mask（短标题不淡化）
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const check = () => setTitleOverflow(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [clip.title]);

  // 双 mask layer + 默认 source-over composite (alpha 相加 clamp 到 1)：
  // layer1 沿 y 切——第 1 行 alpha=1，第 2 行 alpha=0；
  // layer2 沿 x fade——所有行右尾 32px 渐隐；
  // add 后视觉：第 1 行完全可见 (max(1, fade)=1)，仅第 2 行尾部水平 fade，最后几字渐隐。
  const titleFadeMask =
    'linear-gradient(to bottom, black calc(1.375em * 1), transparent calc(1.375em * 1)), linear-gradient(to right, black calc(100% - 32px), transparent)';
  const titleFadeStyle = titleOverflow
    ? { maskImage: titleFadeMask, WebkitMaskImage: titleFadeMask }
    : undefined;

  const itemBody = (
    <div
      onClick={() => onSelect(clip.id)}
      className={`group relative px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        active
          ? 'bg-black/[0.10] dark:bg-white/[0.12]'
          : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
      }`}
    >
      <div className="flex items-start gap-2">
        {clip.favicon_url || clip.url ? (
          <img
            src={clip.favicon_url || `https://www.google.com/s2/favicons?domain=${new URL(clip.url).hostname}&sz=32`}
            alt=""
            referrerPolicy="no-referrer"
            className="w-4 h-4 mt-0.5 rounded-full shrink-0 object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <span className="w-4 h-4 mt-0.5 rounded-full shrink-0 bg-stone-300 dark:bg-stone-600" />
        )}
        <div className="flex-1 min-w-0">
          <div
            ref={titleRef}
            style={titleFadeStyle}
            className="text-[13px] font-medium text-stone-900 dark:text-stone-100 leading-snug max-h-[calc(1.375em*2)] overflow-hidden break-words"
          >
            {clip.title || '无标题'}
          </div>
          <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 flex items-center gap-1">
            <span className="w-24 truncate">{clip.site_name || '未知来源'}</span>
            <span className="shrink-0 text-stone-300 dark:text-stone-600">·</span>
            <span className="shrink-0 tabular-nums">{formatListItemDate(clip.saved_at, bucket)}</span>
          </div>
        </div>
        {clip.cover_image && (
          <img
            src={clip.cover_image}
            alt=""
            referrerPolicy="no-referrer"
            className="w-12 h-12 rounded-md shrink-0 object-cover bg-stone-200/40 dark:bg-stone-700/40 self-center"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </div>
    </div>
  );

  if (!onRequestDelete) return itemBody;
  return (
    <ListItemContextMenu onDelete={() => onRequestDelete(clip.id)} onPin={onPin ? () => onPin(clip.id, !clip.pinned) : undefined} pinLabel={clip.pinned ? '取消置顶' : '置顶'}>
      {itemBody}
    </ListItemContextMenu>
  );
}
