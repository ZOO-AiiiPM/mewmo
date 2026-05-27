# mewmo

[English](README.md) | 简体中文

macOS 平台的本地优先 AI 信息管家：把笔记、网页剪藏、RSS/Atom 订阅、本地
SQLite 全文搜索和可选的 AI 助手集成在一起。

本仓库只发布产品代码（`app/` 目录内容）。父工作区的开发笔记、skill、journal
和 spec 不在开源范围内。

## 特性

- Markdown 笔记：CodeMirror 实时预览、表格、待办、图片粘贴/拖拽、本地附件。
- 网页剪藏：抓取文章元数据，转成可读 Markdown 存到本地。
- RSS/Atom 订阅：带未读状态、本地 feed 存储。
- 对中文友好的全文搜索：基于 rusqlite + SQLite FTS5 + jieba 分词。
- 可选 AI 面板：可读取当前笔记/剪藏，借助本地工具回答问题。

## 环境要求

- macOS（Apple Silicon），当前打包版本暂不支持 Intel Mac。
- Node.js 22。
- pnpm 10.28.1。
- 安装好 Tauri 2 前置依赖的 Rust 工具链。

## 本地开发

```bash
pnpm install
pnpm tauri dev
```

常用检查命令:

```bash
pnpm lint
pnpm build
cd src-tauri && cargo test
```

## AI 配置(可选)

无 AI key 也能正常使用。要启用 AI 面板,在 app 内打开 AI 设置按钮,保存
OpenAI 兼容的 API key、可选 base URL 和 model。公开 release 构建不会内置任何
开发者 API key。

## 本地数据

macOS 上 app 把 SQLite 数据库和附件存在:

```text
~/Library/Application Support/com.vibecoding.app/
```

App 本身不会上传任何笔记、剪藏、订阅或附件。

## 隐私与安全

- mewmo 是本地优先应用。笔记、剪藏、订阅和附件默认留在 macOS 应用数据目录,
  除非你自己移动或分享它们。
- AI 面板是可选功能。只有在你保存 API key 并主动使用 AI 助手后,它才会向你
  配置的 OpenAI 兼容 endpoint 发起请求。
- 公开 release 构建不会内置任何开发者 API key。
- 当前 demo 构建未签名。首次启动如果 macOS 拦截,先在 Finder 里右键 app 选择
  "打开"。如果仍被拦截,打开 系统设置 -> 隐私与安全性,为 mewmo 选择
  "仍要打开"。

## 发布

push `v*` tag 时 GitHub Actions 会构建 macOS draft release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

只建议从 GitHub Releases 页面下载 demo 构建。

## 协议

MIT
