# Contracts: Notes & Clips Commands（迁移现有 8 个）

接口签名与现有 `app/src/lib/db.ts` 一致——只是从 `Database.load + db.execute / select` 改成 `invoke<T>('cmd_name', args)`。组件调用点不变。

## list_notes() -> Note[]

```typescript
type Note = {
  id: number; title: string; content_md: string;
  tags_text: string;             // 新增字段
  created_at: number; updated_at: number;
};
invoke<Note[]>('list_notes')
// 返回所有笔记按 updated_at DESC
```

## create_note() -> number

```typescript
invoke<number>('create_note')
// 返回新建笔记 id（title='', content_md='', tags_text=''）
```

## update_note(id, patch)

```typescript
type NotePatch = { title?: string; content_md?: string };
invoke<void>('update_note', { id: 42, patch: {...} })
// 不允许直接改 tags_text（只能通过 set_note_tags 同步）
// updated_at 后端自动更新为 unixepoch()
```

## delete_note(id)

```typescript
invoke<void>('delete_note', { id: 42 })
// CASCADE 删除 note_tags + 触发 notes_fts_ad
```

## list_clips() -> Clip[]

```typescript
type Clip = {
  id: number; url: string; title: string; content_md: string;
  excerpt: string; site_name: string; favicon_url: string;
  cover_image: string; author: string; published_at: string;
  tags_text: string;             // 新增
  saved_at: number;
};
invoke<Clip[]>('list_clips')
```

## save_clip(clip)

```typescript
invoke<number>('save_clip', { clip: {...} })
```

## delete_clip(id)

```typescript
invoke<void>('delete_clip', { id: 12 })
// CASCADE 删除 clip_tags + 触发 clips_fts_ad
```

## update_clip(id, patch)

```typescript
type ClipPatch = Omit<Clip, 'id' | 'saved_at' | 'tags_text'>;
invoke<void>('update_clip', { id: 12, patch: {...} })
```

## 错误模型

所有 commands 失败时 reject 一个字符串 error message（来自 rusqlite 错误 + 应用层 `AppError::Custom`）。前端 catch 后统一显示 toast。
