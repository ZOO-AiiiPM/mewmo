# Mewmo 2.0 Architecture

> **Version**: v2.0
> **Last Updated**: 2026-06-25
> **Status**: 架构定稿
> **Authors**: ZOO + Claude Code (collaborative)

---

## 1. 架构总览

### 1.1 一句话定义

云端优先的 AI 信息管理产品。Web + Apple 原生双端，PostgreSQL 为唯一真相源，本地缓存实现"打开即看到"。

### 1.2 架构变化（1.0 → 2.0）

```
之前：Web + Tauri(Mac/Win) + React Native(iOS/Android) ← 3 套渲染层，1 种语言
现在：Web + SwiftUI(Mac/iOS/iPad)                      ← 2 套渲染层，2 种语言
```

| | Web | Apple |
|---|---|---|
| 语言 | TypeScript | Swift |
| UI 框架 | React | SwiftUI |
| 共享什么 | 后端 API 是同一套 | 后端 API 是同一套 |
| 各自独立 | 界面 + 前端逻辑 | 界面 + 前端逻辑 |

去掉 Windows/Android/Tauri/React Native，Apple 全家桶用 SwiftUI 原生。

---

## 2. 代码结构

```
mewmo/
│
├── apps/
│   ├── web/                        ← Next.js（浏览器 + 后端 API + Landing）
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (marketing)/    ← Landing / 定价 / 博客
│   │   │   │   ├── (auth)/         ← 登录注册
│   │   │   │   ├── (app)/          ← 主界面
│   │   │   │   └── api/            ← REST API（Apple App 也调这些）
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── lib/
│   │   └── package.json
│   │
│   ├── apple/                      ← SwiftUI（Mac + iOS + iPad 一个 Xcode 项目）
│   │   ├── mewmo/                  ← 共享代码（三端复用）
│   │   │   ├── App/
│   │   │   │   └── MewmoApp.swift          ← 入口
│   │   │   ├── Views/                      ← 界面
│   │   │   │   ├── Notes/
│   │   │   │   │   ├── NoteListView.swift
│   │   │   │   │   └── NoteEditorView.swift
│   │   │   │   ├── Clips/
│   │   │   │   │   ├── ClipListView.swift
│   │   │   │   │   └── ClipDetailView.swift
│   │   │   │   ├── Feeds/
│   │   │   │   │   ├── FeedListView.swift
│   │   │   │   │   └── FeedEntryView.swift
│   │   │   │   ├── Chat/
│   │   │   │   │   └── CatChatView.swift   ← AI 猫咪
│   │   │   │   ├── Search/
│   │   │   │   │   └── SearchView.swift
│   │   │   │   └── Settings/
│   │   │   │       └── SettingsView.swift
│   │   │   ├── Components/                 ← 可复用 UI 组件
│   │   │   │   ├── Editor/                 ← 富文本编辑器
│   │   │   │   ├── TagPill.swift
│   │   │   │   └── EmptyState.swift
│   │   │   ├── Models/                     ← 数据模型（对应 API 返回）
│   │   │   │   ├── Note.swift
│   │   │   │   ├── Clip.swift
│   │   │   │   ├── Feed.swift
│   │   │   │   └── User.swift
│   │   │   ├── Services/                   ← 网络 + 本地存储
│   │   │   │   ├── APIClient.swift         ← 调后端 API
│   │   │   │   ├── SyncEngine.swift        ← 增量同步
│   │   │   │   ├── LocalStore.swift        ← SwiftData 本地缓存
│   │   │   │   ├── AuthService.swift       ← 登录/Token 管理
│   │   │   │   └── KeychainService.swift   ← 安全存储
│   │   │   ├── ViewModels/                 ← 状态管理（MVVM）
│   │   │   │   ├── NotesViewModel.swift
│   │   │   │   ├── ClipsViewModel.swift
│   │   │   │   ├── FeedsViewModel.swift
│   │   │   │   └── ChatViewModel.swift
│   │   │   └── Utilities/
│   │   │       ├── Extensions/
│   │   │       └── Constants.swift
│   │   ├── mewmo-iOS/              ← iOS/iPad 专属（适配小屏、手势）
│   │   │   ├── iOSApp.swift
│   │   │   └── Platform/
│   │   │       ├── PushNotifications.swift
│   │   │       ├── ShareExtension/         ← 系统分享菜单剪藏
│   │   │       ├── Haptics.swift
│   │   │       └── BiometricAuth.swift     ← Face ID
│   │   ├── mewmo-macOS/            ← Mac 专属（菜单栏、快捷键）
│   │   │   ├── macOSApp.swift
│   │   │   └── Platform/
│   │   │       ├── MenuBar.swift           ← 菜单栏快捷入口
│   │   │       ├── GlobalShortcuts.swift   ← 全局快捷键
│   │   │       └── Notifications.swift
│   │   ├── mewmo.xcodeproj
│   │   └── Package.swift           ← Swift Package 依赖
│   │
│   ├── agent/                      ← AI 后台服务（Node.js，24h 运行）
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── scheduler.ts
│   │   │   ├── jobs/
│   │   │   │   ├── daily-review.ts
│   │   │   │   ├── auto-tag.ts
│   │   │   │   ├── auto-summary.ts
│   │   │   │   ├── feed-fetch.ts
│   │   │   │   ├── embedding-sync.ts
│   │   │   │   └── cat-memory.ts
│   │   │   ├── workers/
│   │   │   └── triggers/
│   │   └── package.json
│   │
│   ├── admin/                      ← 管理后台（Next.js）
│   └── extension/                  ← 浏览器剪藏扩展
│
├── packages/                       ← 共享代码（TypeScript 侧）
│   ├── db/                         ← Prisma + PostgreSQL
│   ├── ai/                         ← AI 能力
│   ├── sync/                       ← 同步协议定义（客户端实现各自写）
│   │   ├── src/
│   │   │   ├── protocol.ts            ← 同步协议规范（版本号、diff 格式）
│   │   │   ├── conflict.ts            ← 冲突解决策略
│   │   │   └── types.ts               ← 同步相关类型
│   │   └── package.json
│   ├── auth/
│   ├── queue/
│   ├── storage/
│   ├── email/
│   ├── payment/
│   ├── analytics/
│   ├── ui/                         ← Web 共享组件（React）
│   └── shared/                     ← 类型 + 工具
│
├── tooling/
├── docker/
├── .github/workflows/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 3. 同步引擎：两个实现

同步协议是一套，但客户端实现是两份：

```
packages/sync/           ← 协议定义（TypeScript）：规定数据格式、版本号规则、冲突策略
                           Web 端直接用这个包

apps/apple/Services/
├── SyncEngine.swift     ← Swift 实现同一套协议
└── LocalStore.swift     ← SwiftData 本地缓存（替代 Web 的 IndexedDB）
```

服务端 API 是同一个，两个客户端用各自语言实现同步逻辑，但行为一致。

---

## 4. Apple 端本地缓存：SwiftData

SwiftData 是 Apple 2023 年推出的 ORM（类似 Prisma 对 TypeScript 的关系）：

```swift
// apps/apple/mewmo/Models/Note.swift
@Model
class Note {
    var id: String
    var slug: String
    var title: String
    var content: String
    var summary: String?
    var pinned: Bool = false
    var version: Int = 1
    var createdAt: Date
    var updatedAt: Date
    var tags: [Tag]
}
```

数据自动持久化到设备 SQLite，打开 App 瞬间从本地读，后台静默同步。

---

## 5. Apple 端性能优势

| 能力 | SwiftUI 原生 | 如果用 WebView（Tauri） |
|------|-------------|----------------------|
| 列表滚动 | `List` / `LazyVStack`，系统级 60fps | div 滚动，偶尔掉帧 |
| 启动速度 | < 500ms（编译为机器码） | 1-2s（加载 WebView + JS） |
| 内存 | 30-50MB | 150-300MB |
| 动画 | 系统弹簧动画，GPU 加速 | CSS transition，CPU |
| 系统集成 | Spotlight 搜索、Widget、Shortcuts、Handoff | 几乎无 |
| 体积 | 10-20MB | 50-100MB |

---

## 6. Agent 分工

| Agent | 负责 | 语言 | 文件边界 |
|-------|------|------|---------|
| **用户** | PM + 验收 | — | — |
| **1 基建** | monorepo + CI/CD + Docker | 配置 | `turbo.json` `.github/` `docker/` `tooling/` |
| **2 数据层** | DB + Auth + Queue + Storage + Payment | TypeScript | `packages/db` `auth` `queue` `storage` `payment` |
| **3 同步** | 同步协议 + Web 端实现 | TypeScript | `packages/sync` |
| **4 AI** | AI 能力 + Agent 后台 | TypeScript | `packages/ai` `apps/agent` |
| **5 Web** | 网站界面 + API | TypeScript | `apps/web` `packages/ui` |
| **6 Apple** | Mac + iOS + iPad 全部 | Swift | `apps/apple/` |
| **7 扩展** | 浏览器剪藏 | TypeScript | `apps/extension/` |
| **8 Admin** | 管理后台 | TypeScript | `apps/admin/` |

**Agent 6（Apple）最重**：要独立实现一整套客户端（UI + 本地缓存 + 同步引擎 + 平台特性），但只需要调现有 API，不用碰后端。

---

## 7. 执行顺序

```
Phase 0 ─ 用户定功能 scope + 设计稿
           │
Phase 1 ─ Agent 1 基建（2-3 天）
           │
Phase 2 ─ Agent 2 数据层 ┐
       ─ Agent 3 同步协议 ├── 并行（3-5 天）
       ─ Agent 4 AI 能力  ┘
           │
Phase 3 ─ Agent 5 Web（界面 + API）┐
       ─ Agent 4 Agent 后台       ├── 并行（5-7 天）
       ─ Agent 6 Apple（开始）     ┘
           │
Phase 4 ─ Agent 6 Apple（继续）    ┐
       ─ Agent 7 扩展             ├── 并行（5-7 天）
       ─ Agent 8 Admin            ┘
           │
Phase 5 ─ 联调 + 验收 + 上线（3-5 天）
```

Apple 端 Phase 3 就开始：因为 API 在 Phase 3 由 Web Agent 定义好了，Apple Agent 可以同步开始调 API 写界面。

---

## 8. 部署方案

全托管，不自建服务器：

| 组件 | 服务 | 费用 |
|------|------|------|
| Web（Next.js） | Vercel | 免费 |
| Agent worker（Node.js 常驻） | Railway | ~$5/月 |
| PostgreSQL | Neon | 免费（0.5GB） |
| Redis | Upstash | 免费（10k 命令/天） |
| 文件存储 | Cloudflare R2 | 免费（10GB） |
| 邮件 | Resend | 免费（3000 封/月） |

总成本：早期约 $5/月（仅 Agent worker），用户量大了再升级。

---

## 9. 发布节奏

```
第一批：Web + 浏览器扩展（最快验证产品）
第二批：Mac App（核心用户群，Apple 生态入口）
第三批：iOS + iPad（移动场景）
```

---

## 9. 两种语言的代价 vs 收益

**代价**：
- UI 写两遍（React 一遍，SwiftUI 一遍）
- 同步引擎实现两遍（TS 一遍，Swift 一遍）
- 需要一个懂 Swift 的 Agent

**收益**：
- Apple 端体验碾压 WebView 方案（启动快 3x、内存少 5x、动画丝滑）
- 系统深度集成（Widget、Spotlight、Handoff、Apple Watch 未来可扩展）
- App Store 审核更容易过（Apple 偏爱原生 App）
- 用户感知到"这是个认真做的产品"而不是网页套壳

对笔记/知识管理 App 来说，用户每天高频打开、滑动列表、快速记录 — 这些场景原生的体验差距用户一定感知得到。
