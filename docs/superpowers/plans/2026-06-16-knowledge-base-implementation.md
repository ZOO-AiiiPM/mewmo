# Knowledge Base (知识库) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "knowledge base" zone where users organize notes into real filesystem folders, with full CRUD, import/export, and integration with the existing notes zone.

**Architecture:** Knowledge bases are real directories under `vault/library/`. SQLite (vault-meta.db) only stores display metadata (color, sort order). The existing `query::list_notes()` is extended to also scan `library/` so notes appear in both the KB zone and the notes zone timeline.

**Tech Stack:** Rust (Tauri commands, filesystem ops) · SQLite (vault-meta.db v3 migration) · React/TypeScript (frontend components)

---

## File Map

| Purpose | Path | Action |
|---------|------|--------|
| Vault skeleton | `app/src-tauri/src/vault/init.rs` | Modify: add `"library"` to skeleton dirs |
| Migration SQL | `app/src-tauri/src/vault/migrations/vault_meta_v3_knowledge_bases.sql` | Create |
| Register migration | `app/src-tauri/src/vault/meta_db.rs` | Modify: add v3 to MIGRATIONS |
| KB commands | `app/src-tauri/src/commands/knowledge_base.rs` | Create |
| Register module | `app/src-tauri/src/commands/mod.rs` | Modify: add `pub mod knowledge_base` |
| Register handlers | `app/src-tauri/src/lib.rs` | Modify: add commands to invoke_handler |
| Notes query extension | `app/src-tauri/src/vault/query.rs` | Modify: scan `library/` in list_notes |
| Frontend types | `app/src/types.ts` | Modify: add KB types |
| Frontend API | `app/src/lib/kb.ts` | Create |
| Frontend component | `app/src/components/KnowledgeBase.tsx` | Modify: replace mock with real data |

---

### Task 1: Vault Skeleton — Add `library/` Directory

**Files:**
- Modify: `app/src-tauri/src/vault/init.rs:179-211`

- [ ] **Step 1: Add `"library"` to the skeleton dirs array**

In `create_skeleton()`, add `"library"` to the `dirs` array after the `.mewmo` entries:

```rust
fn create_skeleton(vault_path: &Path) -> Result<(), InitError> {
    let dirs = [
        // raw 层
        "raw",
        "raw/clips",
        "raw/feeds-archived",
        "raw/files",
        "raw/images",
        // wiki 层
        "wiki",
        "wiki/notes",
        "wiki/entities",
        "wiki/topics",
        "wiki/reports",
        "wiki/reports/daily",
        "wiki/reports/weekly",
        "wiki/cat-diary",
        "wiki/todos",
        "wiki/todos/active",
        "wiki/todos/done",
        // library 层（知识库）
        "library",
        // .mewmo 程序内部
        ".mewmo",
        ".mewmo/cat",
        ".mewmo/cat/memory",
        ".mewmo/cat/memory/threads",
        ".mewmo/tags",
        ".mewmo/logs",
        ".mewmo/.locks",
    ];
    for d in &dirs {
        fs::create_dir_all(vault_path.join(d))?;
    }
    Ok(())
}
```

- [ ] **Step 2: Verify existing test still passes**

Run: `cd app/src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test test_create_skeleton_full -- --nocapture`

Expected: PASS (create_dir_all is idempotent, adding a new dir doesn't break existing assertions)

- [ ] **Step 3: Commit**

```bash
git add app/src-tauri/src/vault/init.rs
git commit -m "feat(vault): add library/ to vault skeleton for knowledge bases"
```

---

### Task 2: SQLite Migration — Display Metadata Table

**Files:**
- Create: `app/src-tauri/src/vault/migrations/vault_meta_v3_knowledge_bases.sql`
- Modify: `app/src-tauri/src/vault/meta_db.rs:17-19`

- [ ] **Step 1: Create the migration SQL file**

Create `app/src-tauri/src/vault/migrations/vault_meta_v3_knowledge_bases.sql`:

```sql
-- vault-meta.db v3: Knowledge Base display metadata
-- Only stores UI properties (color, sort order) that can't live on the filesystem.
-- The actual KB content (folders + notes) lives in vault/library/<dir_name>/.

CREATE TABLE IF NOT EXISTS knowledge_bases (
    dir_name TEXT PRIMARY KEY,
    color TEXT NOT NULL DEFAULT 'blue',
    position INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT ''
);
```

- [ ] **Step 2: Register migration in meta_db.rs**

In `app/src-tauri/src/vault/meta_db.rs`, update the MIGRATIONS const:

```rust
const MIGRATIONS: &[(u32, &str)] = &[
    (1, include_str!("../migrations/vault_meta_v1.sql")),
    (2, include_str!("../migrations/vault_meta_v2_fts_index.sql")),
    (3, include_str!("../migrations/vault_meta_v3_knowledge_bases.sql")),
];
```

- [ ] **Step 3: Verify migration runs**

Run: `cd app/src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test -- --nocapture 2>&1 | head -30`

Expected: all existing tests pass (migration is additive, idempotent)

- [ ] **Step 4: Commit**

```bash
git add app/src-tauri/src/vault/migrations/vault_meta_v3_knowledge_bases.sql app/src-tauri/src/vault/meta_db.rs
git commit -m "feat(vault): add vault-meta v3 migration for knowledge_bases table"
```

---

### Task 3: Backend — Knowledge Base Commands

**Files:**
- Create: `app/src-tauri/src/commands/knowledge_base.rs`
- Modify: `app/src-tauri/src/commands/mod.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Create the commands file with KB CRUD**

Create `app/src-tauri/src/commands/knowledge_base.rs`:

```rust
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::vault::{init, meta_db::VaultMetaDb, slug};

fn require_vault() -> Result<PathBuf, String> {
    let cfg = init::read_config()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "VAULT_NOT_CONFIGURED".to_string())?;
    Ok(PathBuf::from(&cfg.vault_path))
}

fn library_path(vault: &PathBuf) -> PathBuf {
    vault.join("library")
}

#[derive(Debug, Serialize)]
pub struct KnowledgeBase {
    pub dir_name: String,
    pub name: String,
    pub color: String,
    pub description: String,
    pub position: i32,
    pub note_count: usize,
}

#[derive(Debug, Serialize)]
pub struct KbFolderEntry {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct KbNoteEntry {
    pub slug: String,
    pub title: String,
    pub preview: String,
    pub updated_at: u64,
}

#[derive(Debug, Serialize)]
pub struct KbContents {
    pub folders: Vec<KbFolderEntry>,
    pub notes: Vec<KbNoteEntry>,
}

// ── KB CRUD ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn kb_list(meta: State<'_, VaultMetaDb>) -> Result<Vec<KnowledgeBase>, String> {
    let vault = require_vault()?;
    let lib_dir = library_path(&vault);
    if !lib_dir.exists() {
        return Ok(Vec::new());
    }

    let mut kbs = Vec::new();
    let entries = fs::read_dir(&lib_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = match path.file_name().and_then(|s| s.to_str()) {
            Some(s) if !s.starts_with('.') => s.to_string(),
            _ => continue,
        };

        // Count .md/.html files recursively
        let note_count = count_notes_recursive(&path);

        // Read display metadata from DB (or defaults)
        let (color, position, description) = {
            let conn = meta.conn.lock().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT color, position, description FROM knowledge_bases WHERE dir_name = ?1",
                rusqlite::params![&dir_name],
                |row| Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i32>(1)?,
                    row.get::<_, String>(2)?,
                )),
            )
            .unwrap_or_else(|_| ("blue".to_string(), 0, String::new()))
        };

        kbs.push(KnowledgeBase {
            name: dir_name.replace('-', " "),
            dir_name,
            color,
            description,
            position,
            note_count,
        });
    }

    kbs.sort_by_key(|k| k.position);
    Ok(kbs)
}

fn count_notes_recursive(dir: &std::path::Path) -> usize {
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                count += count_notes_recursive(&path);
            } else {
                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
                if ext == "md" || ext == "html" {
                    count += 1;
                }
            }
        }
    }
    count
}

#[tauri::command]
pub async fn kb_create(
    meta: State<'_, VaultMetaDb>,
    name: String,
    color: Option<String>,
) -> Result<KnowledgeBase, String> {
    let vault = require_vault()?;
    let lib_dir = library_path(&vault);
    fs::create_dir_all(&lib_dir).map_err(|e| e.to_string())?;

    let dir_name = slug::slugify(&name);
    let dir_name = slug::unique_slug(&dir_name, &slug::existing_dirs(&lib_dir));
    let kb_path = lib_dir.join(&dir_name);
    fs::create_dir(&kb_path).map_err(|e| e.to_string())?;

    let color_val = color.unwrap_or_else(|| "blue".to_string());

    // Get next position
    let conn = meta.conn.lock().map_err(|e| e.to_string())?;
    let max_pos: i32 = conn
        .query_row("SELECT COALESCE(MAX(position), 0) FROM knowledge_bases", [], |row| row.get(0))
        .unwrap_or(0);

    conn.execute(
        "INSERT OR REPLACE INTO knowledge_bases (dir_name, color, position, description) VALUES (?1, ?2, ?3, '')",
        rusqlite::params![&dir_name, &color_val, max_pos + 1000],
    )
    .map_err(|e| e.to_string())?;

    Ok(KnowledgeBase {
        name: dir_name.replace('-', " "),
        dir_name,
        color: color_val,
        description: String::new(),
        position: max_pos + 1000,
        note_count: 0,
    })
}

#[tauri::command]
pub async fn kb_delete(meta: State<'_, VaultMetaDb>, dir_name: String) -> Result<(), String> {
    let vault = require_vault()?;
    let kb_path = library_path(&vault).join(&dir_name);
    if kb_path.exists() {
        fs::remove_dir_all(&kb_path).map_err(|e| e.to_string())?;
    }
    let conn = meta.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM knowledge_bases WHERE dir_name = ?1", rusqlite::params![&dir_name])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kb_update_meta(
    meta: State<'_, VaultMetaDb>,
    dir_name: String,
    color: Option<String>,
    description: Option<String>,
) -> Result<(), String> {
    let conn = meta.conn.lock().map_err(|e| e.to_string())?;
    if let Some(c) = color {
        conn.execute(
            "UPDATE knowledge_bases SET color = ?1 WHERE dir_name = ?2",
            rusqlite::params![&c, &dir_name],
        ).map_err(|e| e.to_string())?;
    }
    if let Some(d) = description {
        conn.execute(
            "UPDATE knowledge_bases SET description = ?1 WHERE dir_name = ?2",
            rusqlite::params![&d, &dir_name],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Folder CRUD ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn kb_folder_create(
    dir_name: String,
    relative_path: String,
    folder_name: String,
) -> Result<String, String> {
    let vault = require_vault()?;
    let base = library_path(&vault).join(&dir_name).join(&relative_path);
    let new_name = slug::slugify(&folder_name);
    let folder_path = base.join(&new_name);
    fs::create_dir_all(&folder_path).map_err(|e| e.to_string())?;
    Ok(new_name)
}

#[tauri::command]
pub async fn kb_folder_rename(
    dir_name: String,
    relative_path: String,
    new_name: String,
) -> Result<String, String> {
    let vault = require_vault()?;
    let old_path = library_path(&vault).join(&dir_name).join(&relative_path);
    let slugged = slug::slugify(&new_name);
    let new_path = old_path.parent().ok_or("invalid path")?.join(&slugged);
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
    Ok(slugged)
}

#[tauri::command]
pub async fn kb_folder_delete(dir_name: String, relative_path: String) -> Result<(), String> {
    let vault = require_vault()?;
    let path = library_path(&vault).join(&dir_name).join(&relative_path);
    if path.exists() {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Contents Listing ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn kb_list_contents(
    dir_name: String,
    relative_path: Option<String>,
) -> Result<KbContents, String> {
    let vault = require_vault()?;
    let base = match &relative_path {
        Some(rp) => library_path(&vault).join(&dir_name).join(rp),
        None => library_path(&vault).join(&dir_name),
    };
    if !base.exists() {
        return Ok(KbContents { folders: Vec::new(), notes: Vec::new() });
    }

    let mut folders = Vec::new();
    let mut notes = Vec::new();

    let entries = fs::read_dir(&base).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = match path.file_name().and_then(|s| s.to_str()) {
            Some(s) if !s.starts_with('.') => s.to_string(),
            _ => continue,
        };

        if path.is_dir() {
            let rel = match &relative_path {
                Some(rp) => format!("{}/{}", rp, name),
                None => name.clone(),
            };
            folders.push(KbFolderEntry { name, path: rel });
        } else {
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
            if ext != "md" && ext != "html" {
                continue;
            }
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            let mtime = entry.metadata().ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            // Read title from frontmatter or first H1
            let (title, preview) = if ext == "md" {
                match fs::read_to_string(&path) {
                    Ok(content) => {
                        let parsed = crate::vault::frontmatter::parse(&content);
                        let t = parsed.frontmatter.as_ref()
                            .and_then(|f| f.extra.get("title"))
                            .and_then(|v| v.as_str())
                            .map(String::from)
                            .unwrap_or_else(|| stem.replace('-', " "));
                        let p = parsed.body.lines()
                            .filter(|l| !l.trim().is_empty() && !l.starts_with('#'))
                            .take(1)
                            .collect::<Vec<_>>()
                            .join("")
                            .chars()
                            .take(80)
                            .collect::<String>();
                        (t, p)
                    }
                    Err(_) => (stem.replace('-', " "), String::new()),
                }
            } else {
                (stem.replace('-', " "), "HTML 文件".to_string())
            };

            let slug = match &relative_path {
                Some(rp) => format!("library/{}/{}/{}", dir_name, rp, stem),
                None => format!("library/{}/{}", dir_name, stem),
            };

            notes.push(KbNoteEntry {
                slug,
                title,
                preview,
                updated_at: mtime,
            });
        }
    }

    folders.sort_by(|a, b| a.name.cmp(&b.name));
    notes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(KbContents { folders, notes })
}

// ── Create Note in KB ────────────────────────────────────────────────────

#[tauri::command]
pub async fn kb_create_note(
    meta: State<'_, VaultMetaDb>,
    dir_name: String,
    relative_path: Option<String>,
    title: String,
) -> Result<String, String> {
    let vault = require_vault()?;
    let target_dir = match &relative_path {
        Some(rp) => library_path(&vault).join(&dir_name).join(rp),
        None => library_path(&vault).join(&dir_name),
    };
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let file_slug = slug::slugify(&title);
    let existing: Vec<String> = fs::read_dir(&target_dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| e.path().file_stem().and_then(|s| s.to_str()).map(String::from))
        .collect();
    let file_slug = slug::unique_slug(&file_slug, &existing);

    let file_path = target_dir.join(format!("{}.md", &file_slug));
    let frontmatter = format!(
        "---\ntype: user-note\ntitle: \"{}\"\ncreated: {}\nupdated: {}\ntags: []\n---\n\n",
        title,
        chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
    );
    fs::write(&file_path, &frontmatter).map_err(|e| e.to_string())?;

    // Return the full relative slug for get_note
    let full_slug = match &relative_path {
        Some(rp) => format!("library/{}/{}/{}", dir_name, rp, file_slug),
        None => format!("library/{}/{}", dir_name, file_slug),
    };

    Ok(full_slug)
}
```

- [ ] **Step 2: Register the module in mod.rs**

Add to `app/src-tauri/src/commands/mod.rs`:

```rust
pub mod clips;
pub mod knowledge_base;
pub mod notes;
pub mod search;
pub mod subscriptions;
pub mod vault;
```

- [ ] **Step 3: Register commands in lib.rs invoke_handler**

Add these lines to the `generate_handler![]` macro in `app/src-tauri/src/lib.rs`:

```rust
commands::knowledge_base::kb_list,
commands::knowledge_base::kb_create,
commands::knowledge_base::kb_delete,
commands::knowledge_base::kb_update_meta,
commands::knowledge_base::kb_folder_create,
commands::knowledge_base::kb_folder_rename,
commands::knowledge_base::kb_folder_delete,
commands::knowledge_base::kb_list_contents,
commands::knowledge_base::kb_create_note,
```

- [ ] **Step 4: Verify compilation**

Run: `cd app/src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo check`

Expected: compilation succeeds (warnings OK, no errors)

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/commands/knowledge_base.rs app/src-tauri/src/commands/mod.rs app/src-tauri/src/lib.rs
git commit -m "feat(kb): add knowledge base Tauri commands (filesystem-based)"
```

---

### Task 4: Frontend — Types and API Layer

**Files:**
- Modify: `app/src/types.ts`
- Create: `app/src/lib/kb.ts`

- [ ] **Step 1: Add TypeScript types to types.ts**

Append to `app/src/types.ts`:

```typescript
export type KnowledgeBase = {
  dir_name: string;
  name: string;
  color: string;
  description: string;
  position: number;
  note_count: number;
};

export type KbFolderEntry = {
  name: string;
  path: string;
};

export type KbNoteEntry = {
  slug: string;
  title: string;
  preview: string;
  updated_at: number;
};

export type KbContents = {
  folders: KbFolderEntry[];
  notes: KbNoteEntry[];
};
```

- [ ] **Step 2: Create the API layer**

Create `app/src/lib/kb.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core';
import type { KnowledgeBase, KbContents } from '../types';

export async function listKbs(): Promise<KnowledgeBase[]> {
  return invoke<KnowledgeBase[]>('kb_list');
}

export async function createKb(name: string, color?: string): Promise<KnowledgeBase> {
  return invoke<KnowledgeBase>('kb_create', { name, color });
}

export async function deleteKb(dirName: string): Promise<void> {
  return invoke<void>('kb_delete', { dirName });
}

export async function updateKbMeta(dirName: string, color?: string, description?: string): Promise<void> {
  return invoke<void>('kb_update_meta', { dirName, color, description });
}

export async function createKbFolder(dirName: string, relativePath: string, folderName: string): Promise<string> {
  return invoke<string>('kb_folder_create', { dirName, relativePath, folderName });
}

export async function renameKbFolder(dirName: string, relativePath: string, newName: string): Promise<string> {
  return invoke<string>('kb_folder_rename', { dirName, relativePath, newName });
}

export async function deleteKbFolder(dirName: string, relativePath: string): Promise<void> {
  return invoke<void>('kb_folder_delete', { dirName, relativePath });
}

export async function listKbContents(dirName: string, relativePath?: string): Promise<KbContents> {
  return invoke<KbContents>('kb_list_contents', { dirName, relativePath });
}

export async function createKbNote(dirName: string, relativePath: string | undefined, title: string): Promise<string> {
  return invoke<string>('kb_create_note', { dirName, relativePath, title });
}
```

- [ ] **Step 3: Verify build**

Run: `cd app && pnpm build`

Expected: compiles successfully

- [ ] **Step 4: Commit**

```bash
git add app/src/types.ts app/src/lib/kb.ts
git commit -m "feat(kb): add frontend types and API layer for knowledge base"
```

---

### Task 5: Frontend — Replace Mock Data with Real API

**Files:**
- Modify: `app/src/components/KnowledgeBase.tsx`

- [ ] **Step 1: Rewrite KnowledgeBase.tsx to use real API**

Replace the mock data and connect to the Tauri commands. The component keeps the same visual structure (grid → drill-in → breadcrumb + folders pinned at top + notes list) but fetches from `kb.ts` API layer.

Key changes:
- Remove all `MOCK_*` constants
- Add `useEffect` hooks to fetch `listKbs()` on mount and `listKbContents()` on navigation
- Wire up `createKb()` in the "新建知识库" button
- Wire up `createKbFolder()` and `createKbNote()` for in-KB creation
- Pass the `slug` from `KbNoteEntry` to the existing `getNote()` / NoteEditor flow when a note is clicked

This is the largest single change — the full component code should be written in implementation (the existing POC structure is preserved, only the data source changes).

- [ ] **Step 2: Verify in browser**

Run: `cd app && pnpm dev` (or use existing vite instance)

Test: Click "知识库" zone → see empty state or any existing `library/` folders → create a KB → verify directory created on filesystem

- [ ] **Step 3: Commit**

```bash
git add app/src/components/KnowledgeBase.tsx
git commit -m "feat(kb): connect knowledge base UI to real filesystem data"
```

---

### Task 6: Extend Notes Zone to Include Library Notes

**Files:**
- Modify: `app/src-tauri/src/vault/query.rs:101-116`

- [ ] **Step 1: Extend list_notes to also scan library/**

In `query::list_notes()`, after scanning `wiki/notes`, also recursively scan `library/`:

```rust
pub async fn list_notes(vault: &Path) -> Result<Vec<NoteSummary>, io::IoError> {
    // Existing: scan wiki/notes (non-recursive, filter user-note)
    let entries = io::list(vault, "wiki/notes", false, Some("user-note")).await?;
    let mut summaries: Vec<NoteSummary> = entries
        .into_iter()
        .map(|e| NoteSummary {
            slug: path_to_slug(&e.relative_path),
            title: e.title.unwrap_or_else(|| "无标题".to_string()),
            tags: e.tags,
            mtime: e.mtime,
            created: e.created,
            updated: e.updated,
            body_preview: e.body_preview,
            format: "md".to_string(),
            pinned: e.pinned,
        })
        .collect();

    // NEW: also scan library/ recursively
    let lib_entries = io::list(vault, "library", true, Some("user-note")).await?;
    for e in lib_entries {
        summaries.push(NoteSummary {
            slug: path_to_slug(&e.relative_path),
            title: e.title.unwrap_or_else(|| "无标题".to_string()),
            tags: e.tags,
            mtime: e.mtime,
            created: e.created,
            updated: e.updated,
            body_preview: e.body_preview,
            format: "md".to_string(),
            pinned: e.pinned,
        });
    }

    // Existing: append HTML notes from wiki/notes...
    // (keep the existing HTML scan code unchanged)
```

- [ ] **Step 2: Verify notes list includes library notes**

Run: `cd app/src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test -- --nocapture`

Then manually: create a note in a KB via the UI, switch to notes zone → the note should appear in the timeline.

- [ ] **Step 3: Commit**

```bash
git add app/src-tauri/src/vault/query.rs
git commit -m "feat(kb): extend list_notes to include library/ directory notes"
```

---

### Task 7: Integration — Open KB Note in Editor

**Files:**
- Modify: `app/src/components/KnowledgeBase.tsx` (click handler)
- Possibly: `app/src-tauri/src/vault/query.rs` (get_note with library/ path)

- [ ] **Step 1: Verify get_note works with library/ slugs**

The existing `get_note` resolves slug → `wiki/notes/<slug>.md`. For library notes, the slug is `library/AI-学习/foo`. Check if `query::get_note()` handles this:

The `get_note` function in `query.rs` uses `io::read(vault, &format!("wiki/notes/{slug}.md"))`. This won't work for library paths. Need to detect if slug starts with `library/` and read directly:

```rust
pub async fn get_note(vault: &Path, slug: &str) -> Result<NoteFull, io::IoError> {
    // Try library path first if slug starts with "library/"
    let md_path = if slug.starts_with("library/") {
        format!("{}.md", slug)
    } else {
        format!("wiki/notes/{}.md", slug)
    };
    // ... rest of existing logic
```

- [ ] **Step 2: Wire up click in KnowledgeBase.tsx**

When a note is clicked in KB, call `updateActiveTab({ zone: 'knowledge', refId: slug })` and render the NoteEditor/HtmlReader with that slug (same as notes zone does).

- [ ] **Step 3: Verify end-to-end**

Test: Create note in KB → click it → editor opens → edit content → switch to notes zone → same note visible with updated content.

- [ ] **Step 4: Commit**

```bash
git add app/src-tauri/src/vault/query.rs app/src/components/KnowledgeBase.tsx
git commit -m "feat(kb): support opening and editing library notes in KB zone"
```

---

## Verification Checklist

After all tasks complete:

1. `cd app && pnpm build` → ✅ compiles
2. `cd app/src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test` → ✅ passes
3. `cd app && pnpm tauri dev` → manual testing:
   - [ ] Create knowledge base → directory appears in `vault/library/`
   - [ ] Create folder inside KB → subdirectory created
   - [ ] Create note inside KB → `.md` file written with frontmatter
   - [ ] Click note in KB → opens in editor
   - [ ] Edit note → changes persist
   - [ ] Switch to notes zone → KB note visible in timeline
   - [ ] Delete KB → directory removed
   - [ ] Sidebar order: 订阅 → 剪藏 → 笔记 → 知识库 → 沉淀
