# vibe-coding

> **AI 信息管家**——多源捕获 + AI 整理 + 主动激活，把"信息墓地"变成"按需到达"。
>
> 一个 vibe coding 教学/展示性质的 macOS 桌面 demo（Tauri + 本地 SQLite + 不上传任何数据）。

---

## 当前状态：P1.1（空壳 Note 应用）

| 完成 | 内容 |
|------|------|
| ✅ | Tauri 2 + Vite + React 19 + TS + Tailwind v4 骨架 |
| ✅ | 本地 SQLite（`tauri-plugin-sql` + migrations） |
| ✅ | 笔记 CRUD + Markdown 编辑器（`@uiw/react-md-editor`） |
| ✅ | GitHub Actions 自动打包 macOS .dmg（arm64 + x64） |
| ⏳ | **AI 总结模块对接（已有雏形，待接入）** |
| ⏳ | RSS 多源捕获（P1.2） |
| ⏳ | Daily Brief HTML 可视化（P2） |
| ⏳ | 周报 / 月报 / 发芽（P2） |

完整产品计划见 [`.specify/memory/constitution.md`](.specify/memory/constitution.md)。

---

## 开发

```bash
cd app
pnpm install
pnpm tauri dev   # 开发模式：HMR + 桌面窗口
pnpm tauri build # 出 .app + .dmg 到 src-tauri/target/release/bundle/
```

**首次运行**：会在用户数据目录创建 `vibe.db` SQLite 文件（macOS 路径：`~/Library/Application Support/com.vibecoding.app/`）。

---

## 发布

打 tag → GitHub Actions 自动出 `.dmg` 到 Releases：

```bash
git tag v0.1.0 && git push --tags
```

Demo 阶段未签名，用户首次打开右键 → 打开 即可绕过 Gatekeeper。

---

## 项目协作骨架

| 文件 | 用途 |
|------|------|
| `CLAUDE.md` | 每次 session 自动加载的规则 + 索引 |
| `.specify/memory/constitution.md` | 项目宪法（5 核心原则 + 范围红线） |
| `.specify/templates/` | Spec Kit 模板（spec / plan / tasks 等） |
| `.claude/skills/speckit-*` | 14 个 Spec Kit skills（`/speckit-specify` 等命令触发） |
| `journal.md` | 倒序时间线（决策 / 踩坑 / 反思） |
| `.claude/memory/` | 事实（命令 / API / 路径） |
| `app/` | 实际产品代码（Tauri + Vite） |

---

## License

MIT
