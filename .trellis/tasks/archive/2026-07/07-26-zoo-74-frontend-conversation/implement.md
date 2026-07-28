# Implementation Plan

## 1. Establish A Safe Baseline

- [x] 创建并记录 `codex/zoo-74-frontend-conversation` 分支，不清理或覆盖当前工作区的用户改动。
- [x] 将现有 ZOO-74 草稿与 `HEAD`/父 Spec 对照，列出保留、修复和删除项；确认部署文件、协作层及 ZOO-69 文件不进入本任务提交。
- [x] 记录当前 legacy SSE 和 persisted Chat DTO fixture，作为兼容基线。

## 2. Make The Model Testable

- [x] 把 event/row reconciliation 保持为无 React 依赖的纯函数，补 Vitest 覆盖 legacy text/tool/result、稳定 terminal event、重复/乱序/错误 chatId/turnId、orphan persisted rows 与权威 final text。
- [x] 为 stream frame parser 补分块、多 frame、尾帧、malformed JSON、abort 和 stable/legacy 双协议测试。
- [x] 为 Tool display 与 Markdown 安全边界补测试；复用现有 Markdown/sanitize 能力，移除不可靠的通用 regex parser。

## 3. Repair Conversation State

- [x] activeTurn 保存 input、context、skill、attempt、chatId、turnId 与 lastSeq；重试不丢 context/skill。
- [x] terminal ConversationEvent 真正完成/失败 Turn；legacy result 与 stable terminal event 幂等收口，不盲追加。
- [x] 按 Turn identity upsert stable row，切换 Chat 时以 chatId + generation 隔离 load/stream/command 的迟到回调。
- [x] 断线时执行 persisted reload 降级并保留 replay 边界；没有 ZOO-70 replay API 时明确标记依赖。

## 4. Complete Multi-Chat UX

- [x] 统一 Chat list 与 active chat controller，使新建、选择、重命名、清空和删除成功后列表与 transcript 同步。
- [x] 为 loading、empty、command pending、失败与危险操作确认补可见状态，不静默吞掉错误。
- [x] 保证 context 只在 send-time snapshot 中变化，不改变 active chatId。
- [x] 检查键盘、焦点、ARIA、固定尺寸和长标题/长消息布局。

## 5. Secure Chat APIs

- [x] 覆盖未登录、非法参数、他人 Chat、缺失 Chat 与成功路径；清空/删除只影响已验证 ownership 的目标。
- [x] 检查 repository 方法是否把 userId 纳入实际 mutation 条件；必要时在 Web/DB 所有权边界内修正并补测试。

## 6. Validate

- [x] `pnpm exec vitest run apps/web/src/lib/agent tests/unit/<agent-conversation-tests>`
- [x] `pnpm --filter @mewmo/web lint`
- [x] `pnpm --filter @mewmo/web build`
- [x] 运行相关根级 unit/static API tests；最后执行 `pnpm verify`。
- [ ] 启动未占用端口的本地 Web，确认 `.env.local` 链接与依赖服务；浏览器验证桌面/窄屏、浅色/深色、纯文本、Tool、确认、失败重试、刷新、Chat/context 切换、清空与删除。
- [x] 记录 ZOO-70 未提供 replay DTO 时无法完成的真实断线补发验收，不用 fixture 冒充端到端证据。

浏览器验收阻塞：公开首页可加载，但登录工作区因 `.env.local` 的 `AI_PROVIDER` 无效而返回 Runtime Error；常规开发启动此前还出现开发数据库断连。因此没有把登录态 Agent rail、桌面/窄屏双主题和真实 Chat 命令记为已验收。

## 7. Delivery Gate

- [x] 精确暂存 ZOO-74 文件，审查 `git diff --cached`，确保无部署/协作层/其他 Issue 改动。
- [x] 使用 `trellis-check` 做全范围检查并修复发现的问题。
- [x] 在 Linear ZOO-74 用中文评论根因、改动、验证证据、未验证项、风险和提交，状态进入验收但不标 Done。

## Rollback Points

- Event adapter 与 UI 分层提交，稳定协议兼容出错时可回退到 legacy adapter 而不回滚 Chat 数据。
- Chat mutation 先服务端成功再提交最终 UI 状态；失败保留原列表和 transcript。
- 本任务不改 schema，不执行 Production 数据操作或部署。
