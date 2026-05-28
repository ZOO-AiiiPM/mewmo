import { useEffect, useState } from 'react';
import {
  getDefaultVaultPath,
  getVaultConfig,
  initializeVault,
  type VaultConfig,
} from '../../lib/vault';

/**
 * Vault tab — Phase 0 US1 最小可见入口
 *
 * 状态：
 * - 未初始化 → 显示默认路径 + "初始化 vault" 按钮
 * - 已初始化 → 显示 vault 路径 + active persona + 三层结构说明
 *
 * 不渲染笔记内容（Phase 1 walking skeleton 才做）。
 */
export function VaultLayout() {
  const [config, setConfig] = useState<VaultConfig | null>(null);
  const [defaultPath, setDefaultPath] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getVaultConfig(), getDefaultVaultPath()])
      .then(([c, p]) => {
        setConfig(c);
        setDefaultPath(p);
      })
      .catch((e) => {
        console.error('[vault] load config failed:', e);
        setError(String(e));
      })
      .finally(() => setLoading(false));
  }, []);

  const handleInit = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await initializeVault({});
      setConfig(c);
    } catch (e) {
      console.error('[vault] init failed:', e);
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="relative flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center text-stone-400 dark:text-stone-500 text-sm">
          加载中…
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto sidebar-scroll">
        <div className="max-w-3xl mx-auto p-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">Vault</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            mewmo 的本地知识库——所有数据是 markdown 文件，永远属于你。
          </p>
        </header>

        {config ? (
          <div className="space-y-4">
            <InfoCard label="vault 路径" value={config.vault_path} mono />
            <InfoCard label="当前 persona" value={config.active_persona} />
            <InfoCard label="schema 版本" value={`v${config.schema_version}`} />
            <InfoCard label="初始化时间" value={config.initialized_at} mono />

            <div className="rounded-lg border border-stone-200 dark:border-stone-700 p-4">
              <div className="text-xs text-stone-500 dark:text-stone-400 mb-2">三层结构</div>
              <ul className="font-mono text-sm space-y-1.5 text-stone-800 dark:text-stone-200">
                <li>
                  <span className="text-stone-500 dark:text-stone-400 mr-2">📁</span>
                  raw/<span className="text-stone-500 dark:text-stone-400">　— 原始素材（剪藏 / 沉淀订阅 / 文件 / 图片）</span>
                </li>
                <li>
                  <span className="text-stone-500 dark:text-stone-400 mr-2">📁</span>
                  wiki/<span className="text-stone-500 dark:text-stone-400">　— 合成层（笔记 / 实体 / 主题 / 报告 / 猫日记）</span>
                </li>
                <li>
                  <span className="text-stone-500 dark:text-stone-400 mr-2">📁</span>
                  .mewmo/<span className="text-stone-500 dark:text-stone-400">　— 程序内部（隐藏）：cat persona / tags / logs / locks</span>
                </li>
              </ul>
            </div>

            <p className="text-sm text-stone-500 dark:text-stone-400">
              用 Finder（<code className="font-mono text-xs px-1 py-0.5 rounded bg-black/5 dark:bg-white/5">⌘ Shift G</code> → 输入 vault 路径）或 Obsidian 打开，能看到全部 markdown 文件。
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-stone-700 dark:text-stone-200">
              Vault 还没初始化。点击下方按钮在默认位置创建。
            </p>
            <div className="rounded-lg border border-stone-200 dark:border-stone-700 p-4">
              <div className="text-xs text-stone-500 dark:text-stone-400 mb-1">默认路径</div>
              <div className="font-mono text-sm text-stone-800 dark:text-stone-200">{defaultPath}</div>
            </div>
            <button
              onClick={handleInit}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-sm font-medium hover:opacity-80 disabled:opacity-40 transition-opacity"
            >
              {busy ? '初始化中…' : '初始化 vault'}
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
            <div className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">错误</div>
            <div className="font-mono text-xs text-red-700 dark:text-red-300 break-all">{error}</div>
          </div>
        )}
        </div>
      </div>
    </main>
  );
}

function InfoCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-700 p-4">
      <div className="text-xs text-stone-500 dark:text-stone-400 mb-1">{label}</div>
      <div className={`text-sm text-stone-800 dark:text-stone-200 break-all ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
    </div>
  );
}
