# 新旧 migration schema 不一致

- **症状**：旧库 migration 或 fresh install schema 不一致
- **根因**：只写新 migration，最早建表 SQL 没同步最终 schema；DDL 重跑不幂等
- **修法**：新增列同时更新最早建表 SQL；migration 使用幂等 helper
- **关联文件**：`app/src-tauri/src/db.rs`, `app/src-tauri/src/migrations/*.sql`
- **日期**：2026-05-29

## 踩坑记录

- **教训**：加新 migration 时必须回头同步初始建表 SQL，否则 fresh install 和旧库升级走到不同 schema。规则已固化到 `.claude/rules/db-schema.md`。
