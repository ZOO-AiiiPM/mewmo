# 数据库迁移发布

`packages/db/prisma/migrations/` 是数据库结构的发布历史。新数据库和已纳管环境只执行 migration，Preview 与生产禁止使用 `db:push`。

## 新数据库

部署平台注入目标环境的 `DATABASE_URL` 后执行：

```bash
pnpm db:migrate:deploy
pnpm db:migrate:status
```

baseline 创建完整当前 Schema；后续 additive migration 可重复检查对象是否存在，但仍由 Prisma 迁移表保证只应用一次。

## 已有 Neon 数据库首次纳管

已有数据库可能包含 Prisma Schema 未建模的历史表，例如 `video_details` 和 `video_user_highlights`。这些表是有效数据，不能通过 `db:push` 或 reset 消除 drift。

首次纳管按环境分别执行：

1. 在 Neon 创建可恢复分支或恢复点。
2. 使用只读 Schema diff 核对 baseline 中已有的对象，确认现有业务表和列与 `schema.prisma` 相容。
3. 将 baseline 登记为已应用，不执行 baseline SQL：

```bash
pnpm --filter @mewmo/db exec prisma migrate resolve --applied 20260722000000_baseline
```

4. 执行 additive AI Runtime migration 并检查状态：

```bash
pnpm db:migrate:deploy
pnpm db:migrate:status
```

Neon Preview 若从已纳管的父分支创建，会继承 `_prisma_migrations`。旧 Preview 分支需要独立执行同一核对流程。数据库失败时从 Neon 恢复点恢复；结构修复使用新的 forward migration，不删除未知表，也不把 `migrate resolve --rolled-back` 当成数据回滚。
