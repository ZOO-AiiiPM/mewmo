# Notes CRUD — 编辑器接入真实数据库

> Date: 2026-06-28
> Status: Draft
> Branch: `2.0`
> Scope: `apps/web/src/app/(app)/notes/`, `apps/web/src/app/api/notes/`, `apps/web/src/components/editor/`

---

## 1. Goal

把笔记模块从 mock data 切换到真实 PostgreSQL 读写。用户能新建、浏览、编辑、删除笔记，编辑器输入 debounce 自动保存。

---

## 2. Why

当前笔记页面用的是内存 mock 数据，编辑不持久化、刷新丢失。编辑器 UI（Atomic Editor）已就绪，需要接上真实存储让产品可 dogfood。

---

## 3. What

### 3.1 笔记列表页 `/notes`

- 从 DB 查当前用户所有未删除笔记，按 `updatedAt desc` 排序
- 显示 title、更新时间、摘要（前 80 字）
- 点击进入编辑页

### 3.2 笔记详情/编辑页 `/notes/[slug]`

- 从 DB 按 slug + userId 查笔记
- Atomic Editor 加载 `content`
- 输入后 800ms debounce 自动 PATCH 保存
- 标题可编辑，也 debounce 保存

### 3.3 新建笔记

- 列表页「New Note」按钮
- POST 创建空笔记（title: "Untitled", content: ""）
- 创建后跳转到编辑页

### 3.4 删除笔记

- 编辑页 ... 菜单中「Delete」
- 软删除（设 `deletedAt`）
- 删除后跳转回列表

### 3.5 API 路由

| Method | Path | 功能 |
|--------|------|------|
| GET | `/api/notes` | 列表（当前用户，未删除） |
| POST | `/api/notes` | 新建 |
| GET | `/api/notes/[id]` | 单条详情 |
| PATCH | `/api/notes/[id]` | 更新 title/content |
| DELETE | `/api/notes/[id]` | 软删除 |

所有路由需 auth 校验（`session.user.id`），只能操作自己的笔记。

---

## 4. Constraints

- Slug 创建后不变（URL 稳定性），上线时 URL 策略作为独立需求
- 自动保存 debounce 800ms，不设手动保存按钮
- 不做标签、搜索、排序（scope 外）
- 不做协作编辑、版本历史
- 编辑器方案确定为 Atomic Editor（不保留 B 方案）

---

## 5. Out of Scope

- 标签系统
- 全文搜索
- 排序/筛选
- 批量操作
- 离线支持
- 版本历史/冲突处理
