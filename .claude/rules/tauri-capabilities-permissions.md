---
paths:
  - "src-tauri/capabilities/*.json"
  - "src-tauri/src/lib.rs"
  - "src-tauri/src/main.rs"
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Tauri 2 加新 webview API 必须显式授权

Tauri 2 用细粒度 capability 权限模型，**`core:default` 只包含基础 API**（事件、路径、HTTP 等基础），**所有窗口操作都要单独加权限**，否则 React 端调用时会被 IPC 层默默 reject 或日志报错"permission denied"。

## 触发场景

任何时候在 React/TS 代码里写 `getCurrentWindow().XXX()` 或类似的 Tauri webview API 调用，**先**到 `src-tauri/capabilities/default.json` 加对应权限。

本项目已踩过的坑：
- `startDragging()` → 必须加 `"core:window:allow-start-dragging"`
- `toggleMaximize()` → 必须加 `"core:window:allow-toggle-maximize"`
- `setTheme(theme)` → 必须加 `"core:window:allow-set-theme"`
- `setTitle()` / `minimize()` / `close()` / `setSize()` 等同理，每个都有自己的 `allow-XXX` 权限

## 权限命名规律

格式：`core:<plugin>:allow-<command-kebab-case>`

- `core:window:*` —— 窗口控制（移动、缩放、关闭、主题等）
- `core:webview:*` —— webview 内部
- `core:event:*` —— 事件系统
- `core:path:*` —— 路径
- 第三方插件类似：`sql:allow-execute`、`fs:allow-read-file` 等

## 排查方法

调用 API 后没反应（窗口没拖动 / 没切主题 / 没改大小）但**控制台无报错**——大概率是权限缺失。检查：
1. `src-tauri/capabilities/*.json` 的 `permissions` 数组里有没有对应 `allow-XXX`
2. Rust 侧日志（`pnpm tauri dev` 输出）有没有 "Unauthorized" 或 "permission denied"
3. 加完权限要等 Rust 重编译完才生效（capabilities 改动会触发增量重编译）

## 完整权限清单查询

```bash
# 查 window 插件全部权限名
ls "$HOME/.cargo/registry/src/index.crates.io-*/tauri-2.*/permissions/"
# 或本地缓存
find app/src-tauri/target/debug/build -name "*.toml" -path "*tauri-window*"
```

更稳的方法：直接看 https://v2.tauri.app/reference/acl/permission/ 全部权限文档，或在 capabilities/default.json 里输入 `"core:window:allow-` 让 IDE 自动补全（`$schema` 已配）。

## Why（蒸馏依据）

本项目第 35 / 45 / 50 轮三次为 webview API 现加权限——startDragging / toggleMaximize / setTheme 各踩一次。每次都是"调用没反应 → 查日志 / 查文档 → 加权限 → 重编译"循环，平均浪费 5-10 分钟。蒸馏成 rule 后，**写新 webview 调用时第一时间检查 capabilities**。
