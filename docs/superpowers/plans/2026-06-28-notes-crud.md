# Notes CRUD Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-28-notes-crud.md`
**Goal:** 笔记模块接入真实 PostgreSQL，支持列表、详情、新建、编辑（debounce 自动保存）、软删除。

---

## File Structure

- Create `apps/web/src/app/api/notes/route.ts`: GET 列表 + POST 新建
- Create `apps/web/src/app/api/notes/[id]/route.ts`: GET 单条 + PATCH 更新 + DELETE 软删除
- Modify `apps/web/src/app/(app)/notes/page.tsx`: 从 DB 读列表，加新建按钮
- Modify `apps/web/src/app/(app)/notes/[slug]/page.tsx`: 从 DB 读笔记，接入编辑器
- Modify `apps/web/src/components/editor/NoteEditor.tsx`: debounce 自动保存到 API
- Remove `apps/web/src/components/editor/EditorSwitch.tsx`: 不再需要 A/B 切换
- Remove `apps/web/src/components/editor/CM6Editor.tsx`: 已删除（确认清理）
- Remove `apps/web/src/components/editor/MDXEditorWrapper.tsx`: 已删除（确认清理）

---

## Task 1: API Routes

**Files:**
- Create: `apps/web/src/app/api/notes/route.ts`
- Create: `apps/web/src/app/api/notes/[id]/route.ts`
- Test: `tests/unit/notes-api.test.ts`

- [x] **Step 1: Write failing API tests**

验证：
- GET /api/notes 返回当前用户笔记列表
- POST /api/notes 创建笔记返回 201
- GET /api/notes/[id] 返回单条笔记
- PATCH /api/notes/[id] 更新 content/title
- DELETE /api/notes/[id] 软删除（设 deletedAt）
- 未认证请求返回 401

- [x] **Step 2: Implement API routes**

GET /api/notes:
- auth 校验
- `prisma.note.findMany({ where: { userId, deletedAt: null }, orderBy: { updatedAt: "desc" } })`
- 返回 id, slug, title, updatedAt, content 前 80 字作 summary

POST /api/notes:
- auth 校验
- 生成 slug（title → kebab-case，重复时加数字后缀）
- `prisma.note.create({ data: { title, slug, content: "", userId } })`

GET /api/notes/[id]:
- auth 校验 + userId 过滤
- 返回完整 note

PATCH /api/notes/[id]:
- auth 校验 + userId 过滤
- 更新 title 和/或 content
- version increment

DELETE /api/notes/[id]:
- auth 校验 + userId 过滤
- `update({ data: { deletedAt: new Date() } })`

- [x] **Step 3: Run tests, verify green**

---

## Task 2: Note Editor Component

**Files:**
- Modify: `apps/web/src/components/editor/NoteEditor.tsx`
- Remove: `apps/web/src/components/editor/EditorSwitch.tsx`

- [x] **Step 1: Simplify NoteEditor**

Props: `{ noteId: string, initialContent: string, initialTitle: string }`

编辑器选型经历 Atomic Editor → MDXEditor → **Milkdown Crepe**（最终）。前两者分别因「`-` 未输空格即渲染圆点」「受控 state 导致光标丢失」被弃用。Crepe 是 ProseMirror 内核的成熟 WYSIWYG，输入规则原生正确（`-` 显示 `-`，`- ` 才转列表），且非受控（`defaultValue` + listener）天然无光标问题。

功能：
- `MilkdownProvider` + `useEditor`（deps `[]`，只建一次）加载 `defaultValue=initialContent`
- `crepe.on(l => l.markdownUpdated(...))` 监听变更；`readyRef` 跳过加载时的首次规范化 emission，避免纯打开就刷新 updatedAt
- 标题用 contentEditable div
- 内容变更 debounce 800ms 后 PATCH `/api/notes/${noteId}`，标题 300ms
- 保存状态指示器（Saving... / Saved）

- [x] **Step 2: Remove EditorSwitch and unused files**

清理废弃方案的全部依赖：`@atomic-editor/editor`（含 pnpm patch）、`@mdxeditor/editor`、裸 `codemirror` / `@codemirror/*` / `@lezer/*` / `react-markdown`。

---

## Task 3: Notes List Page (Real DB)

**Files:**
- Modify: `apps/web/src/app/(app)/notes/page.tsx`

- [x] **Step 1: Rewrite notes list page**

- Client component，useEffect fetch GET /api/notes
- 渲染笔记卡片列表（title + updatedAt + summary）
- 点击跳转 `/notes/${slug}`
- 「New Note」按钮 → POST /api/notes → router.push 到新笔记

---

## Task 4: Note Detail Page (Real DB)

**Files:**
- Modify: `apps/web/src/app/(app)/notes/[slug]/page.tsx`

- [x] **Step 1: Rewrite note detail page**

- Server component 从 DB 按 slug + userId 查笔记
- 找不到返回 notFound()
- 渲染 NoteEditor 传入 noteId + initialContent + initialTitle
- 删除按钮 → DELETE /api/notes/[id] → router.push("/notes")

---

## Risks

1. **Slug 冲突**：同用户创建同名笔记时 slug 重复。缓解：创建时检测冲突加数字后缀。
2. **并发保存**：快速输入多次触发 PATCH。缓解：debounce + 后端 version increment（乐观锁留后续）。
3. **Turbopack + pg**：API routes 需确保 pg 走 serverExternalPackages。已在 next.config.mjs 配置过。

---

## DoD (Definition of Done)

1. `pnpm dev` 启动无报错
2. 登录后 `/notes` 显示 DB 中的笔记列表（空列表时显示空状态）
3. 点「New Note」创建新笔记并跳转编辑页
4. 编辑标题和内容，800ms 后自动保存，刷新页面内容不丢
5. 删除笔记后回到列表，该笔记不再显示
6. 测试全绿
