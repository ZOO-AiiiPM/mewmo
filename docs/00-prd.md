# Mewmo 2.0 PRD

> **Version**: v2.0
> **Last Updated**: 2026-06-25
> **Status**: 产品决策定稿，待开发
> **Authors**: ZOO + Claude Code (collaborative)

---

## 1. 产品定义

云端优先的 AI 信息管理产品。用户用它收集（剪藏/订阅）、记录（笔记）、沉淀（AI 辅助回顾）。

**核心体验承诺**：打开即看到内容（< 100ms），不等网络。

**平台**：Web + Mac + iOS + iPad + 浏览器扩展（不做 Windows/Android）

---

## 2. 第一版功能 Scope

| 模块 | 包含 | 不包含 |
|------|------|--------|
| 笔记 | 创建/编辑/删除/搜索，markdown 实时渲染 | 协作编辑、版本历史 |
| 剪藏 | 保存网页内容、全文阅读、标签 | 批注、高亮标注 |
| RSS 订阅 | 添加/删除订阅源、文章列表、阅读、AI 总结 | OPML 导入导出（后续加） |
| AI 侧边栏 | 对话 + agent 能力（执行动作：打标签、总结、搜索） | 人格/prompt 定制、主动推送 |
| 全文搜索 | 跨笔记/剪藏/RSS 搜索 | 语义搜索（后续加 embedding） |
| 浏览器扩展 | 一键剪藏当前页面 | 划选剪藏、标注 |
| 认证 | 邮箱 + Google OAuth | Apple 登录、手机验证码、微信 |

---

## 3. 产品决策清单

### 3.1 用户模式

- 开放注册，免费使用
- AI 功能免费提供，不付费
- 无存储限额（笔记/剪藏/RSS/AI 对话/附件均不限）
- 后续根据成本情况再考虑付费或限额

### 3.2 AI 侧边栏

- 纯对话式 + agent 能力
- 能执行动作：打标签、总结笔记、搜索内容、跨内容关联
- **无猫咪人格**，不做 prompt 定制
- 用户在设置里选主模型（Claude / GPT / DeepSeek 等）
- 后台任务（打标签、总结、embedding）自动用小模型（Haiku / GPT-4o-mini），用户无感

### 3.3 编辑器

- CodeMirror 6 + live preview（Obsidian 风格：光标行露源码，其他行渲染）
- 候选方案：Atomic Editor（`@atomic-editor/editor`）— 开源的 Obsidian 风格 CM6 编辑器
- 开发时对比测试 Atomic Editor vs 自写 livePreview，选体验更好的
- 纯 markdown，不做 block editor
- Apple 端用 Swift 原生方案（TextKit 2），与 Web 端独立实现

### 3.4 标签系统

- **预设标签池**：系统预设一批标签
- **用户可自定义**：用户可以新增标签到池中
- **AI 从池中选**：内容保存时 AI 从池中匹配 1-3 个标签打上，不能自己造新的
- **AI 学习用户行为**：用户手动打的新标签进入池，AI 以后会学着用
- 标签数量用户可控，不会爆炸

### 3.5 认证

- 邮箱 + 密码（含忘记密码/邮箱验证）
- Google OAuth
- 使用 Auth.js，零额外成本
- 不做：Apple 登录（暂不上架 App Store）、手机验证码、微信登录

### 3.6 RSS 订阅

- 拉取频率：默认每 1 小时
- 拉取由程序完成（HTTP 请求解析 feed），不用 AI
- 拉到新文章后 AI 后台做总结 + 打标签（BullMQ 队列异步）
- 用户不限订阅源数量

### 3.7 AI 模型策略

| 场景 | 模型 |
|------|------|
| 用户对话 | 用户选的主模型（Claude / GPT / DeepSeek） |
| 打标签 | 小模型（Haiku / GPT-4o-mini） |
| 生成摘要 | 小模型 |
| Embedding | embedding 专用模型 |
| Agent 复杂操作 | 用户选的主模型 |

通过 Vercel AI SDK 多 provider 支持，切换模型只改 config。

---

## 4. 不做的事（明确排除）

- ❌ AI 猫咪人格 / prompt 定制
- ❌ 主动推送 / 定时回顾
- ❌ Windows / Android
- ❌ 协作编辑
- ❌ Block editor（Notion 风格）
- ❌ 付费 / 订阅 / 限额（第一版）
- ❌ Apple 登录 / 手机验证码 / 微信登录（第一版）

---

## 5. 发布节奏

```
第一批：Web + 浏览器扩展（最快验证产品）
第二批：Mac App
第三批：iOS + iPad
```
