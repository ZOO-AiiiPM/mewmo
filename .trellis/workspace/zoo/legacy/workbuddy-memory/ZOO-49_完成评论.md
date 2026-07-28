# ZOO-49 完成评论(2026-07-23)

> 复制下面整段到 Linear ZOO-49 的评论区提交。

## ZOO-49 完成(2026-07-23)

### 改动
- 弃用 magic-link 重置密码流程,改为 **6 位邮箱验证码**(`crypto.randomInt` 生成 + `timingSafeEqual` 常数时间比较)。
- 注册流程新增**邮箱验证码校验**;通过后建用户并设置 `emailVerified`。
- 新增 `POST /api/auth/send-code`(注册发码);`forgot-password` / `reset-password` 路由重写为 OTP 流程,**不再使用 JWT token**。
- 注册页加验证码输入 + 60s 冷却"获取验证码"按钮;忘记密码/重置密码页同步更新。

### 存储
- `RedisOtpStore`(ioredis,key = `otp:<email>:<purpose>`,Redis 原生 `EX` 10 分钟 TTL);`MemoryOtpStore` 进程内降级(未配置 `REDIS_URL` 时启用 + `console.warn`,仅用于本地/单实例)。
- 6 项安全边界:600s TTL、5 次错锁 600s、60s 重发冷却、注册拒已存在(409)、重置防枚举(静默)、`timingSafeEqual` 时序安全。

### 决策锁定
- **6 位验证码**(你拍板)
- **Redis 存储**(ioredis 客户端,Upstash 托管)
- **Vercel env 状态**:
  - `REDIS_URL` Production 已设(原条目为空是内存降级根因,已用真实值覆盖)
  - `REDIS_URL` Preview(分支 `codex/zoo-49-otp`)已设
  - Redis URL 连通性已从外部用 ioredis set/get 验证 OK
- 单测:`otp-code` 4 + `otp-store` 7 + `sendOtp` 2 = 13 项通过;`next build` 通过。

### CI & 交付
- PR: https://github.com/ZOO-AiiiPM/mewmo/pull/21
- CI 全绿(6 步:install / db:generate / lint / build / test:unit / test:theme),Vercel Preview 部署完成。
- 验收路径:PR preview URL(走分支专用 `REDIS_URL`,验证码落 Redis,多实例安全)。

### 验收注意点
- 注册:`/register` → 填邮箱/密码 → "获取验证码" → 邮件查 6 位码 → 提交。成功后 `emailVerified` 置为当前时间。
- 重置密码:`/forgot-password` → 填邮箱 → 邮件查码 → 跳 `/reset-password?email=...` → 填码+新密码提交。
- 60s 重发冷却 + 5 次错锁 10 分钟,前端按钮也做了 60s 禁用。
- 重置流程对"邮箱不存在"静默返回成功,防账号枚举探测。
