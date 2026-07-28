# mewmo 项目长期记忆

## 协作角色
- 本项目用 Linear + MCP 管 issue。本 agent 默认被指定为**验收/QA 角色**：浏览器端最终测试，判定 issue 能否通过。验收依据 agent.md「验证标准/验证顺序」；失败先分类（实现回归 vs 需求变更 vs 环境漂移）。
- 默认只诊断+指导；用户可就单 issue 明确授权"全流程实现"（如 ZOO-49）→ 走 Spec→实现→验证→PR→完成评论。

## 工具链 & 关键约定（2026-07-14/22）
- Linear MCP 已激活（`~/.workbuddy/mcp.json` 配 `https://mcp.linear.app/mcp`）。`agent.md` 非 git-tracked，`AGENTS.md`(10B) 是指针。
- **Linear 双写快照约定**：改 repo 源 `agent.md`/`docs/02-architecture.md` 须同步 Linear 文档「Agent.md」/「Mewmo 2.0 Architecture」。本会话 Linear 写文档工具加载失败，需用户提供 token 或手动粘贴回填。
- **Linear issue 截图直链可用**：`uploads.linear.app/...` JWT exp 仅 5min，实测长期 200。`curl -L` 下载改 `.png` 用 Read 渲染，别凭 exp 放弃。
- **浏览器验收走 Playwright CLI**（非 MCP）：托管 node 装 playwright+Chromium，写 e2e 打云端 URL。

## 本地开发陷阱（2026-07-22）
- Next.js 16 build 被 `NODE_OPTIONS=--use-system-ca` 破坏 → `NODE_OPTIONS="" pnpm --filter @mewmo/web build`。
- `git fetch/push` HTTP2 framing 失败 → `git -c http.version=HTTP/1.1 ...`。
- `apps/web/src/lib/*.test.ts` 不在 `pnpm test:unit` 覆盖 → 单跑 `npx vitest run <path>`。
- Prisma client stale（tsc 报 aiRun 等不存在）→ `pnpm db:generate`。

## CI 序列 & 兜底（自 ZOO-60）
- 序列：`install --frozen-lockfile`→`db:generate`→`lint`→`build`→`test:unit`→`test:theme`。推前必本地复跑。
- 三类失败：① lint unused import（不能 `_x` 绕过，删 import）；② test:unit stale 静态断言锁旧契约（断言方向相反→改测试非实现，常见于 workspace-prototype-ui/knowledge-move-ui-static）；③ build stale Prisma→`db:generate`。
- 兜底（worktree 内）：`NODE_OPTIONS="" pnpm --filter @mewmo/web lint` + `db:generate` + `build` + `test:unit`。
- CI 查询：`gh pr checks <N>` / `gh run list --workflow=ci --branch=<b>` / `gh run view <id> --log-failed`。

## 验收流程（云端 staging，非本地 docker）
- main→`https://mewmo.vercel.app`；PR preview→`pr-<n>.mewmo.vercel.app`；数据 Neon+Upstash。验收打云端 URL。
- 步骤：拉 Linear issue+关联 branch/PR → 定目标 URL → Playwright 双主题/ownership/乐观更新/虚拟滚动/XSS sanitize/离线回退 → 输出证据+通过/打回。

## 后端架构（2026-07-14 决策，已落地 VPS）
- 原"Oracle+Coolify"→实际为**带宝塔的 CentOS/RHEL VPS**(101.36.117.253)。宝塔 Docker 部署 rss-worker + ai-server + langfuse（不另装 Coolify）。数据接 Neon（前端零改动）。
- 放置原则：RSS 常驻→VPS 容器；AI 简单摘要→Vercel Function 或 VPS 内；真 agent（多步/流式/有状态）→VPS 真实服务，绝不跑前端。

## 生产域名（2026-07-21）
- `mewmo.zooooo.site`（canonical，CNAME→cname.vercel-dns.com）替代 `mewmo.vercel.app`。Preview 仍走 vercel.app。
- 改配置：Vercel `NEXTAUTH_URL`=新域（Preview/Dev 留空）；Google OAuth 加新域 origin/redirect；Resend 发件域按需验证。源码零硬编码（auth.ts trustHost:true）。
- `FEED_REFRESH_BASE_URL` 于 2026-07-16 移除，cron 直连 DB → 换域名对宝塔 worker 零影响。

## Skills/Superpowers（2026-07-21）
- `agent.md` 是给 Codex/Claude Code 的冷启动入口，非 WorkBuddy。Superpowers 已作 WB 项目级 skill 装 `.workbuddy/skills/`（14 个，obra/superpowers MIT）。WB 不自动注入，按任务手动调用。勿为 Superpowers 改 live agent.md。

## Git 分支纪律（2026-07-23 用户明确纠正）
- 任何独立功能/agentic 实现任务，**必须先从当前分支切出独立 feature 分支再做**（repo 命名约定 `codex/<slug>`，如 `codex/langfuse-tracing`）。**绝不直接在已有分支的脏工作树上改**。
- 切分支前若工作树有无关脏改动，先 `git stash -u` 收起（可 `git stash pop` 还原），保持新分支干净起步。
- 教训：2026-07-23 一轮 Langfuse 埋点直接改在 `codex/zoo-49` 工作树，会话间写盘未保留 → 代码全丢。分支隔离既能避免污染也能防丢失。

## 生产部署执行（PR27/ZOO-60-65，2026-07-24）
- PR27 `integration/ai-retrieval-tools` 部署模式：服务器侧（agent/worker 容器 + cron）+ Vercel web env 双侧。镜像 `mewmo-agent:local`/`mewmo-worker:local`（= `:0450c5f`）在 VPS。
- **agent 域名走 intro-builder 共用 Caddy**：服务器 80/443 被 intro-builder 的 `agent-caddy-1` 容器独占，mewmo-agent 域名只能往 `/opt/intro-agent/apps/agent/Caddyfile` **append** site block（绝不改现有 intro-builder block），`reverse_proxy mewmo-agent-agent-1:3101`。Caddy 自动签 Let's Encrypt。
- **容器网络坑**：mewmo-agent 默认在 `mewmo-agent_default` 网络，Caddy 在 `agent_default`，互不可达。必须 `docker network connect agent_default mewmo-agent-agent-1`。⚠️ **运行时连接，agent 容器重建（compose down/up）会丢**，需重连或改 compose 加 external network 持久化。
- **Caddy 证书 CA 坑**：docker volume `agent_caddy_data` 残留 staging 状态时，新站点会被带偏到 `acme-staging`（测试环境，浏览器不信任）。修复：在站点 block 内显式 `tls { ca https://acme-v02.api.letsencrypt.org/directory }`。验证签发是否生产级用 `openssl s_client` 看 issuer 是否为 Let's Encrypt YE2/R3（非 "Fake LE Intermediate"）。
- **Caddy 重试退避坑**：DNS 未生效时首次 reload 会让 Caddy 把签发排进 30~60min 重试队列；DNS 生效后必须再 `caddy reload` 强制立即重试，否则要干等很久。
- **SSH 不稳**：到 VPS 偶发 `kex_exchange_identification: Connection reset by peer`，加重试循环（5 次 + sleep 8）+ `ServerAliveInterval=20` 可稳定进入。
- **向量回填坑**：`db:backfill-vectors` 读旧 `content_embeddings.embedding`(JSONB) 写 `embedding_vector`(vector(768))。旧 BMC relay 数据维度不匹配会全 skip（written=0），新内容靠 ai-workflows cron 用新 Gemini embedding 生成，短期检索召回偏空属正常。
- **agent 鉴权**：`/v1/*` 全部要 `Authorization: Bearer <HS256 JWT>`，secret = `AGENT_IDENTITY_SECRET`(agent 端) = `AGENT_INTERNAL_SECRET`(web 端)，共享值在 `tmp/.agent-shared-secret`。`identity.ts` 有 `signIdentityForTest` 可构造测试 token。
- **Vercel 部署正确方法（关键）**：mewmo Vercel 项目是 **git 集成**——push 到 `main`→自动生产部署（别名 `mewmo-git-main-mew-mo.vercel.app`），push 到分支→preview（`mewmo-git-<branch>-...`）。**生产部署 = 合并 PR 到 main**，git 自动 checkout committed 源码（遵守白名单式 `.gitignore`，不上传 `node_modules`/`.next`）。⚠️ **不要用 `vercel --prod` CLI 上传本地工作目录**：仓库 `.gitignore` 是 `/*`+`!/apps/` 白名单式，本地有 `.next`(2.3G)/`node_modules`(1.4G)/`worktree`(1.3G)，CLI 上传会撞 15000 文件上限或 5.5GB OOM。验证部署：`vercel ls --prod` 看新部署 Building→Ready；`curl https://mewmo.zooooo.site` 看 HTTP 200。
- **环境变量更新后如何生效**：env var 在 Vercel 控制台/CLI 设好后，需触发新部署才生效。①只改 env 没改代码→`vercel redeploy <latest-prod-url>` 重用源码重建（不重新上传）；②改了代码→合并到 main 触发 git 自动部署。设变量用 `vercel env add NAME production --value V --force -y`；`--force` 对相同值是 no-op（不刷时间戳，看 `vercel env list` 时间戳判断是否真改）。
- **E 脚本约定**：`deploy/vercel-env-update.sh` 从 `.env.local` + `tmp/.agent-shared-secret` 读凭据，用 `vercel env add NAME production --value V --force -y` 非交互更新。AGENT_SERVER_URL 需 DNS 生效后单独加。脚本只设变量不重部署；重部署走上面 git merge 或 `vercel redeploy`。
- SSH：`sshpass -P passphrase -p '008520' ssh -i ~/.ssh/id_ed25519 root@101.36.117.253`（008520 是私钥 passphrase）。

## Trellis 完全改造决策（2026-07-24，进行中）
- 用户改用"完全改造"路线：引入 `.trellis/` 标准目录（`spec/` `tasks/` `workspace/` `skills/` `agents/` `hooks/`），统一到 `.agents/skills/` 共享层 + 各平台薄适配。
- 蓝图见 `TRELLIS-完全改造清单.md`。**breaking 点**：`agent.md` 第 3/29 行"禁止分层/迁走"硬约束将被改为 Trellis 式薄索引（D1），需用户二次确认措辞。
- 原则（改造中保留）：① breadcrumb 读 Linear issue 状态（不建独立文件状态机，避免双源）；② 保留 mewmo 验证哲学（断言=产品契约，check skill 不覆盖）；③ brainstorming 仍独立，不强搬 Trellis 固定链；④ Linear MCP 验收闭环不得削弱。
- `TRELLIS-对齐差距清单.md` 的"保持 bespoke"结论已作废。
