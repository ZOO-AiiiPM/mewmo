import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { HtmlFileInput, ImportHtmlResult } from '../lib/db';
import { importHtmlNote, importHtmlDir, importHtmlPaths } from '../lib/db';

type Props = {
  open: boolean;
  onClose: () => void;
  /** 导入完成（成功 ≥1 条）时通知父层刷新 notes 列表 */
  onImported: (firstSlug: string | null, results: ImportHtmlResult[]) => void;
};

/**
 * HTML 文件 / 目录导入对话框
 *
 * 三种入口（同 dialog 内）：
 * 1. 粘贴绝对路径 textarea（主入口）—— Finder Cmd+Option+C 复制路径流；混合 file + dir，dir 自动递归扫 .html
 * 2. 选文件 button（次）—— `<input type="file" accept=".html,.htm" multiple>` 让用户在系统对话框里多选
 * 3. 选目录 button（次）—— `<input type="file" webkitdirectory>` 让用户选整个目录，前端过滤 .html
 *
 * 1 走后端 import_html_paths（Rust 直接读 fs，文件再大也 IPC 不传内容）；
 * 2/3 走 import_html_note / import_html_dir（前端 File.text() 传 content 给后端，避免依赖 fs 权限）
 */
export function ImportHtmlDialog({ open, onClose, onImported }: Props) {
  const [pathsInput, setPathsInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [okCount, setOkCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  const parsedPaths = useMemo(
    () =>
      pathsInput
        .split(/[\n\r]+/)
        .map(l => l.trim())
        .filter(l => l.length > 0),
    [pathsInput],
  );

  const reset = () => {
    setBusy(false);
    setProgress(null);
    setErrors([]);
    setOkCount(null);
  };

  const closeDialog = () => {
    if (busy) return;
    setPathsInput('');
    reset();
    onClose();
  };

  /** 收尾：依据 results 设置错误列表 + 触发父层 refresh，全成功则关 dialog */
  const finishWith = (results: ImportHtmlResult[]) => {
    const okList = results.filter(r => r.slug != null);
    const failList = results.filter(r => r.error != null);
    setOkCount(okList.length);
    setErrors(failList.map(r => `${r.source_name}: ${r.error}`));
    onImported(okList[0]?.slug ?? null, results);
    if (failList.length === 0 && okList.length > 0) {
      // 全成功——清空输入 + 关闭
      setPathsInput('');
      reset();
      onClose();
    }
  };

  // 主入口：粘贴绝对路径，走 import_html_paths
  const handlePathsSubmit = async () => {
    if (parsedPaths.length === 0) return;
    setBusy(true);
    setErrors([]);
    setOkCount(null);
    setProgress({ done: 0, total: parsedPaths.length });
    try {
      const results = await importHtmlPaths(parsedPaths);
      setBusy(false);
      setProgress({ done: results.length, total: results.length });
      finishWith(results);
    } catch (err) {
      setBusy(false);
      setErrors([`后端导入失败：${String(err)}`]);
    }
  };

  // 次入口 1：单文件 / 多文件 picker
  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    setBusy(true);
    setErrors([]);
    setOkCount(null);
    setProgress({ done: 0, total: files.length });

    const results: ImportHtmlResult[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        const text = await f.text();
        const slug = await importHtmlNote(f.name, text);
        results.push({ slug, source_name: f.name, error: null });
      } catch (err) {
        results.push({ slug: null, source_name: f.name, error: String(err) });
      }
      setProgress({ done: i + 1, total: files.length });
    }

    setBusy(false);
    finishWith(results);
  };

  // 次入口 2：webkitdirectory 选目录
  const handleDirPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const all = Array.from(e.target.files ?? []);
    e.target.value = '';
    const htmls = all.filter(f => /\.html?$/i.test(f.name));
    if (htmls.length === 0) {
      setErrors(['这个目录里没有 .html 文件 (｡•́︿•̀｡)']);
      return;
    }

    setBusy(true);
    setErrors([]);
    setOkCount(null);
    setProgress({ done: 0, total: htmls.length });

    const inputs: HtmlFileInput[] = [];
    for (let i = 0; i < htmls.length; i++) {
      try {
        const text = await htmls[i].text();
        inputs.push({ filename: htmls[i].name, content: text });
      } catch (err) {
        // 读文件失败也作为一条 result
        inputs.push({ filename: htmls[i].name, content: '' });
        setErrors(prev => [...prev, `${htmls[i].name}: 读文件失败 — ${String(err)}`]);
      }
      setProgress({ done: i + 1, total: htmls.length });
    }

    try {
      const results = await importHtmlDir(inputs);
      setBusy(false);
      finishWith(results);
    } catch (err) {
      setBusy(false);
      setErrors([`后端导入失败：${String(err)}`]);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          onClick={closeDialog}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center"
        >
          <motion.div
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
            className="w-[520px] max-w-[calc(100%-64px)] bg-white dark:bg-stone-800 rounded-xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden"
          >
            <div className="px-5 py-5 space-y-3">
              <div>
                <div className="text-[14px] font-medium text-stone-900 dark:text-stone-100">
                  导入 HTML 到笔记
                </div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed mt-1">
                  在 Finder 选文件 →&nbsp;
                  <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-black/5 dark:bg-white/10">⌥⌘C</kbd>
                  &nbsp;复制路径 → 粘贴下面，回车批量导入。可混合文件和目录，目录自动递归扫 .html。
                </div>
              </div>

              <textarea
                value={pathsInput}
                onChange={e => {
                  setPathsInput(e.target.value);
                  setErrors([]);
                  setOkCount(null);
                }}
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handlePathsSubmit();
                  }
                  if (e.key === 'Escape' && !busy) closeDialog();
                }}
                placeholder={'/Users/you/Downloads/article.html\n/Users/you/Documents/saved-pages/\n…'}
                disabled={busy}
                rows={6}
                autoFocus
                className="w-full text-[12px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 rounded-lg px-2.5 py-1.5 outline-none text-stone-800 dark:text-stone-200 placeholder:text-stone-400 dark:placeholder:text-stone-600 disabled:opacity-50 resize-none font-mono leading-snug"
              />

              <button
                onClick={handlePathsSubmit}
                disabled={busy || parsedPaths.length === 0}
                className="w-full text-[12px] py-1.5 rounded-lg bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {busy && progress
                  ? `导入中… ${progress.done}/${progress.total}`
                  : parsedPaths.length === 0
                    ? '粘贴路径以导入（每行一条）'
                    : `导入 ${parsedPaths.length} 条路径`}
              </button>

              {/* 备用入口：file picker（不熟悉路径复制的用户） */}
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
                <span className="text-[10px] text-stone-400 dark:text-stone-500">或</span>
                <div className="flex-1 h-px bg-black/[0.08] dark:bg-white/[0.08]" />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="flex-1 text-[11px] py-1.5 px-3 rounded-md bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  选文件
                </button>
                <button
                  onClick={() => dirInputRef.current?.click()}
                  disabled={busy}
                  className="flex-1 text-[11px] py-1.5 px-3 rounded-md bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  选目录
                </button>
              </div>

              {okCount !== null && okCount > 0 && errors.length > 0 && (
                <div className="text-[11px] text-stone-600 dark:text-stone-300 px-0.5">
                  ✓ 成功导入 {okCount} 条
                </div>
              )}

              {errors.length > 0 && (
                <div className="text-[11px] text-red-500 dark:text-red-400 leading-snug px-0.5 max-h-32 overflow-y-auto space-y-0.5">
                  <div className="font-medium">{errors.length} 条失败：</div>
                  {errors.map((e, i) => (
                    <div key={i} className="truncate" title={e}>· {e}</div>
                  ))}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm"
                multiple
                onChange={handleFilePick}
                className="hidden"
              />
              <input
                ref={dirInputRef}
                type="file"
                onChange={handleDirPick}
                className="hidden"
                // @ts-expect-error webkitdirectory 是非标准属性，TS 不认但 Chromium / WebView 都支持
                webkitdirectory=""
                directory=""
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
