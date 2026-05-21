# 大功能开发期间 app 挂了、阻塞小功能推进

## 问题

大功能开发到一半，app 跑不起来（编译错误 / 运行时崩溃 / 依赖未完成）。
此时想推进小功能，却无法启动 app 验证效果，整条开发链被卡死。

## 根因

大功能的 WIP 代码直接落在了主干（main），破坏了可运行状态。
小功能和大功能共用同一份代码，无法独立运行和验证。

## 解法

### 救场（已经挂了）

```bash
# 1. 把现状保存到 feature 分支
git add -A && git commit -m "wip: <大功能名称>"
git checkout -b feature/<大功能名称>   # 若还在 main，先建分支

# 2. main 回到最后一个可运行的 commit
git checkout main
git reset --hard <最后正常的 commit hash>  # git log 找

# 3. 小功能在干净的 main 上继续做
```

### 预防（大功能启动前）

**开 feature 分支**：预估超过 2 小时 / 多文件改动的功能，第一步就建分支，不在 main 上直接做。

**拆成可运行的增量切片**：每一片 commit 后 app 必须还能跑：
1. 加数据结构（DB schema / TypeScript types）→ UI 照旧，app 可运行
2. 加后端命令 / API → 前端暂不接，app 可运行
3. 加前端，用 feature flag 包住，默认关 → app 可运行
4. 开 flag 验收，通过后删 flag，merge 回 main

**Feature Flag 模板**（针对 UI 变更）：

```tsx
// app/src/featureFlags.ts
export const FEATURES = {
  newBigThing: false,  // 开发中默认关，本地调成 true
}

// 组件里
{FEATURES.newBigThing && <NewBigComponent />}
```

## 铁律

**main 永远可运行**：每次 commit 前必须能 `pnpm tauri dev` 跑起来。
大功能 WIP 状态禁止落到 main，只存 feature 分支。

## 反模式

- 大功能边做边往 main commit WIP 代码 → 主干挂了阻塞所有人（所有功能）
- feature 分支拖太久不 merge → 积累巨大 merge conflict
- feature flag 用完忘记删 → 代码库残留死代码

## 适用场景

- 任何"预计超过 1 个小时"或"涉及 ≥3 个文件"的功能
- 涉及数据库 migration、Rust 依赖变更、新组件架构的功能
