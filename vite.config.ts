import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Tauri 桌面 App，配 Vite 监听固定端口给 Tauri 使用
// VITE_PORT 让 scripts/dev.sh 按 worktree 分配不同端口，多 app 同时跑互不冲突
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'safari15',
    minify: 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
