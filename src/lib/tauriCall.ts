import { invoke } from '@tauri-apps/api/core';

// __TAURI_INTERNALS__ 注入有时序窗口，webview 启动到注入完成有几十毫秒间隙。
// React useEffect 可能落在这个窗口里，invoke 会同步 throw `Cannot read invoke of undefined`。
// 包装一层短延迟重试，最多覆盖 ~500ms（10 × 50ms）—— 实际通常 1-2 次就成功。
//
// 这是所有 Tauri command wrapper 共用的入口。db.ts / subscription.ts / attachments.ts
// 历史上分别直接调 invoke，订阅区因此撞过 Tauri inject 时序失败抛错的 bug；统一改用
// 这里的 call<T> 之后行为一致。
export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < 10; i++) {
    try {
      return await invoke<T>(cmd, args);
    } catch (e) {
      const msg = String(e);
      // 只对"Tauri 还没注入"类错误重试，业务错误立即抛
      if (msg.includes('undefined') || msg.includes('__TAURI')) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 50));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
