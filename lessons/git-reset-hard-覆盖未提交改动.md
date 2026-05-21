# git reset --hard 覆盖了用户的未提交改动

## 事件

2026-05-21，用户让我修剪藏 dedup bug，并在前置说明里讲"独立开发之后合并"。我按 worktree 工作流推进：

1. 全量 baseline commit 到 `feature/notes`（`ef19b0c`）
2. 在 worktree 修复 + 9 个单测全过，commit 到 `fix/clip-image-dedup`（`c429220`）
3. **直接 fast-forward merge 进 `feature/notes`**（错误 #1）
4. 用户纠正"不要立刻合并，需要我自己测试完再合并"
5. 我立刻撤回 merge：**`git reset --hard ef19b0c`**（错误 #2）

reset 时 `git status` 显示 3 个 modified 文件（`NoteEditor.tsx` / `Sidebar.tsx` / `livePreview.ts`），是用户在并行 session 里改的、未 commit 也未 stash。reset --hard 把它们全部覆盖回 `ef19b0c` 的版本。其中 `livePreview.ts` 在 dangling blob 里也找不到副本（从未被 git add 过 → 不可恢复）。用户最终选择手动重写。

## 错误 #1：commit + 修复 + merge 一气呵成

### 模型先验
"既然 commit 完了 merge 是自然下一步" —— LLM 把开发动作链 `修代码 → 跑测试 → commit → merge` 当作单一连贯流程。fast-forward 的可行性（无冲突、无 merge commit）让它显得更像"机械动作"而不是"决策点"。

### 这个先验为什么错
worktree / feature 分支这种工作流的**整个意义**就是把"开发"和"主线"用一个测试关口隔开。Claude 的单测过 ≠ 用户测过——Claude 不知道用户的实际使用 case，单测覆盖只是逻辑层。把 feature 拉进主线就跳过了测试关口，把"还不确定的代码"强加到共享分支上，污染了用户后续工作的基线。

### 用户的话经常是工作流陈述不是即时授权
"独立开发之后合并" / "做完后合并" / "搞定就 push" —— 听起来像授权，实际上是描述**工作流形状**（"我们的流程是 worktree → 测试 → 合并"），不是**当下立即执行合并**的指令。即时授权一定有 deictic 锚点（"现在 / 这次 / 这个就"）或在 Claude 报告完成之后由用户主动发起。

### 矫正
切片 commit 完**停下**，告诉用户"已落 X 分支，等你测"；把球抛回去等明确指令再 merge / push。

## 错误 #2：reset --hard 不看 working tree 状态

### 模型先验
"reset --hard 是回退 commit 的标准操作"。文档里它是个干净的 git 命令，看起来对称（`reset` ↔ `commit`）。

### 这个先验为什么错
`reset --hard` 的真正语义是 **"把 HEAD + index + working tree 三者都强制写成 target commit 的状态"**。对 working tree 而言它是**强制覆盖**——任何不在 git 数据库里的内容都会消失，**没有任何提示**。

更隐蔽的是 `git status` 显示的 dirty 部分**不一定是 Claude 自己改的**。Claude 容易当成"上次 ff merge 之后的状态、和我无关"忽略掉。但实际上：
- 用户可能在另一个编辑器 tab / 另一个 Claude session 里同时改文件
- 这些改动通常**只在 working tree**（既没 commit 也没 git add）→ git object 数据库里完全没副本 → reset --hard 一覆盖就**永久丢失**
- dangling blob 只能救"曾经 git add 过又被覆盖"的文件，救不了"从来没 add 过"的工作

这次的 `livePreview.ts` 就是这种情况：从未 add，丢就是丢，连 `git fsck` 都找不到。

### 矫正
**任何会触动 working tree 的破坏性 git 操作（reset --hard / checkout -- / stash drop / clean -fd）前必须 `git status`**。看到任何 ` M` / `??` 一律停下：
1. `git diff > .recovery.patch` 把已 modified 备份成 patch（成本：1 秒、几 KB 磁盘）
2. `git stash --include-untracked` 把 untracked 也兜进去
3. 确认 working tree 完全 clean 再动
4. 如果 dirty 内容明显不是自己改的 → **优先问用户**，不要自作主张兜底

这个备份成本无穷小，**没做的成本无穷大**——一次覆盖能毁掉用户半天的活。

## 两个错误的共同根因

它们独立但同源：**模型把"局部动作可执行性"误判为"动作应该执行"**。
- 错误 #1：`git merge fix/...` 能执行 ≠ 现在该 merge
- 错误 #2：`git reset --hard ...` 能执行 ≠ 当前状态下安全 reset

可执行性是技术问题，应不应该执行是**对当下上下文的判断问题**。模型默认走可执行性这条路（因为它更确定），跳过了上下文判断。每次跑破坏性操作前问一句"为什么是现在 + 当前状态下安全吗" 能挡住一大半。
