---
paths:
  - "src-tauri/Cargo.toml"
  - "src-tauri/tauri.conf.json"
  - "src-tauri/src/lib.rs"
  - "src-tauri/src/main.rs"
---

# Tauri 2 macOS 透明窗口必须开 macos-private-api

本项目用 macOS 毛玻璃（NSVisualEffectMaterial）。要让 `transparent: true` 真生效，**两件事必须都做**：

1. `src-tauri/Cargo.toml` 里 tauri 依赖必须带 feature：
   ```toml
   tauri = { version = "2.x", features = ["macos-private-api"] }
   ```

2. `src-tauri/tauri.conf.json` 里 app 段加 `macOSPrivateApi: true`：
   ```json
   "app": {
     "macOSPrivateApi": true,
     "windows": [{ "transparent": true, ... }]
   }
   ```

**Why**：Tauri 2 在 macOS 上启用透明窗口需要使用 Apple 私有 API。少配任一项，`transparent: true` 会被**静默忽略**——窗口看起来正常但是纯白底，调试时容易以为是 vibrancy 调用失败 / CSS 问题，浪费时间。日志会有一行提示 "The window is set to be transparent but the `macos-private-api` is not enabled"，但很容易被淹没。

**触发锚点**：本项目要改 Tauri macOS 透明 / 毛玻璃 / vibrancy 时，先验证这两项都开了再调试别的。

**不能上 Mac App Store**：用了私有 API 的 App 不能通过 App Store 审核。本 demo 不上架，所以 OK；如果未来要上架，必须放弃透明 + 毛玻璃，改用纯不透明窗口。

## 完整启用毛玻璃的清单（互相独立，不要遗漏）

- [ ] Cargo.toml: `tauri` features 加 `macos-private-api`
- [ ] Cargo.toml: 加 `window-vibrancy = "0.7"` 依赖
- [ ] tauri.conf.json: `app.macOSPrivateApi: true`
- [ ] tauri.conf.json: window 配 `transparent: true`、`titleBarStyle: "Overlay"`、`hiddenTitle: true`
- [ ] src/lib.rs: setup 里调 `apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, ...)`
- [ ] index.css: `html, body, #root { background: transparent !important; }`
- [ ] 所有组件去掉硬色背景（`bg-stone-50` / `bg-white` 等），改用半透明叠加（`bg-white/5` / `bg-black/[0.02]` 等）
