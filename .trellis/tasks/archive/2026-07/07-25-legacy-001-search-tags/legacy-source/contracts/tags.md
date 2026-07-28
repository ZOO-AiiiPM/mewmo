# Contracts: Tags Commands

## list_tags() -> Tag[]

```typescript
type Tag = {
  id: number;
  name: string;
  note_count: number;            // 关联笔记数
  clip_count: number;            // 关联剪藏数
};
invoke<Tag[]>('list_tags')
// SQL: SELECT t.id, t.name, COUNT(DISTINCT nt.note_id) AS note_count, COUNT(DISTINCT ct.clip_id) AS clip_count
//      FROM tags t LEFT JOIN note_tags nt ON ... LEFT JOIN clip_tags ct ON ...
//      GROUP BY t.id ORDER BY t.name
```

## set_note_tags(note_id, tag_names)

```typescript
invoke<void>('set_note_tags', { noteId: 42, tagNames: ['项目', '机器学习'] })
```

后端事务：
1. trim 每个 tag name；过滤空字符串；去重
2. 应用层校验：每个 name 长度 1-50；不含空格
3. `INSERT OR IGNORE INTO tags(name) VALUES (?), ...` —— 不存在的标签自动建
4. `DELETE FROM note_tags WHERE note_id = ?` —— 清现有关联
5. `INSERT INTO note_tags SELECT ?, id FROM tags WHERE name IN (...)` —— 重建
6. 触发器自动同步 `notes.tags_text` → notes_fts

## set_clip_tags(clip_id, tag_names)

```typescript
invoke<void>('set_clip_tags', { clipId: 12, tagNames: ['新闻', '产品'] })
```

行为同 set_note_tags，对应 clip_tags 表。

## rename_tag(old_name, new_name)

```typescript
invoke<void>('rename_tag', { oldName: '机器学习', newName: 'ML' })
```

后端事务：
1. 应用层校验 new_name 长度 + 不含空格 + 与 old_name 不同
2. `UPDATE tags SET name = ? WHERE name = ?`（UNIQUE 约束保证不会冲突 —— 冲突时 reject）
3. 手动 UPDATE 所有受影响 notes / clips 的 tags_text（重算 GROUP_CONCAT）
4. UPDATE 触发 notes_fts_au / clips_fts_au

错误：
- new_name 已存在 → reject `"标签 'X' 已存在"`
- old_name 不存在 → reject `"标签 'X' 不存在"`

## delete_tag(name)

```typescript
invoke<void>('delete_tag', { name: '弃用标签' })
```

后端事务：
1. `DELETE FROM tags WHERE name = ?`
2. CASCADE 自动清 note_tags / clip_tags
3. 触发器同步：受影响 notes / clips 的 tags_text 重算 → FTS 重新索引
4. **不删除任何笔记 / 剪藏**（FR-020）

## 错误模型

所有 commands 失败时 reject 字符串 error。前端 catch 后显示 toast，保留用户操作不回滚 UI。
