# Claude Code Hook 系统 — 在 Agent 工作流里嵌入硬约束

> **用途**：把"应该每次都做但 LLM 会忘"的规则从软约束升级成机器执行的脚本。
> **适用**：mewmo 项目（Tauri 2 + Vite + React 桌面 App），但 hook 系统本身和项目类型无关。
> **维护**：本文事实部分（schema 字段、exit code 行为）来自 Claude Code 官方文档；项目实战部分会随 `.claude/hooks/` 改动同步更新。

---

## 1. 一句话定义

**Hook = Claude Code 工作流里的事件订阅点。** Claude Code 跑到某个时机（用户提交 prompt、要调用工具、即将结束、新 session 启动等）会暂停，调用你挂在该时机的脚本，根据脚本的 exit code 和 stdout 决定下一步。

本质等同于：
- 前端 lifecycle hook（React `useEffect`、Vue `onMounted`）
- 后端 middleware（中间件链）
- Git hooks（`pre-commit`、`post-merge`）

把"在某节点插入用户代码"做成系统级 API。

---

## 2. 8 个 hook events（按时机分类）

按 Claude 运行轨迹分三类：

### before（拦截类） — 在 Claude 动作之前介入

| Event | 触发时机 | 典型用途 |
|-------|---------|---------|
| `UserPromptSubmit` | 用户刚提交 prompt，Claude 还没开始处理 | 注入 context、过滤 prompt、计数提醒 |
| `PreToolUse` | Claude 准备好工具参数，**还没调用** | 安全检查、参数改写、强制要求授权 |
| `PreCompact` | 即将做对话压缩 | 提前做 journal 转储、保留关键 context |

### after（反应类） — 在 Claude 动作之后介入

| Event | 触发时机 | 典型用途 |
|-------|---------|---------|
| `PostToolUse` | 工具调用成功完成 | 验证结果、跑 lint、自动反馈 |
| `Stop` | Claude 主体回复完成（非用户中断）| 阻止结束、强制反思 |
| `SubagentStop` | 子 agent（Task 工具）完成 | 同上，子 agent 版本 |

### lifecycle（状态类） — 会话生命周期

| Event | 触发时机 | 典型用途 |
|-------|---------|---------|
| `SessionStart` | 新会话开启或恢复 | 注入项目状态 brief、加载 memory |
| `Notification` | 系统通知（待权限、空闲 60s）| 桌面通知、外部告警 |

> **来源**：Claude Code Hooks 官方文档 [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)，权威字段速查 [gist.github.com/FrancisBourre/...](https://gist.github.com/FrancisBourre/50dca37124ecc43eaf08328cdcccdb34)

> **Matcher 限定**：只有 `PreToolUse` / `PostToolUse` 支持 `matcher` 字段（按工具名匹配，如 `"matcher": "Bash"`）。MCP 工具名为 `mcp__<server>__<tool>`。其他 events 忽略 matcher。

---

## 3. 通信协议：脚本怎么和 Claude Code 对话

每个 hook 脚本：
- **stdin** 收事件数据（JSON，含公共字段 `session_id` / `transcript_path` / `cwd` / `hook_event_name` + 事件特有字段如 `tool_name` / `prompt`）
- **exit code + stdout/stderr** 回复决策

三档信号强度：

### 档位 1：`exit 0` + 普通 stdout（轻量反馈）

- 大多数 hook：stdout 进 transcript log（用户按 `Ctrl+R` 看的调试视图），用户主流程**看不到**
- **特例**：`UserPromptSubmit` 和 `SessionStart` 的 stdout **直接拼进 Claude context** —— 这是最简单的"静默注入"方式

### 档位 2：`exit 0` + 结构化 JSON stdout（精确控制）

脚本输出合法 JSON，字段因 hook 而异。**最关键的字段**：

- `hookSpecificOutput.additionalContext`（仅 `UserPromptSubmit` / `SessionStart` 支持）—— 注入 Claude context 但**用户 UI 完全看不到**。这是"静默注入"的唯一标准方式。
- `decision: "block"` + `reason`（多数 hook 支持）—— 阻断 + 反馈，但 reason 会**显示给用户作为 hook feedback**。
- `continue: false`（任何 hook）—— 强制停止整个 Claude 工作流，覆盖所有其他决策。
- `suppressOutput: true`（任何 hook）—— 隐藏 stdout 在 transcript（**不影响 hook feedback UI 框**）。

### 档位 3：`exit 2` + stderr（强阻断）

不同 hook 的 exit 2 含义不同（**容易踩坑**）：

| Event | exit 2 行为 |
|-------|-------------|
| `PreToolUse` | 拦掉本次工具调用，stderr 喂给 Claude |
| `PostToolUse` | 工具已跑完，stderr 给 Claude（用于反馈） |
| `Stop` / `SubagentStop` | 阻止结束，stderr 给 Claude |
| `UserPromptSubmit` | **擦掉用户 prompt**，stderr 只给用户 ⚠️ |
| `Notification` / `PreCompact` / `SessionStart` | 不阻断，stderr 给用户 |

⚠️ **`UserPromptSubmit` 的 exit 2 会擦掉用户辛苦写的 prompt** —— hook bug 时如果意外退出码=2，prompt 就没了。务必用 try/catch + exit 0 兜底。

---

## 4. 项目当前 hook 实战

mewmo 配 3 个 hook，全在 `.claude/hooks/` 下，由 `.claude/settings.local.json` 注册：

```
.claude/hooks/
├── session-brief.js       ← SessionStart hook
├── turn-reflect.js        ← UserPromptSubmit hook
└── pre-bash-tmp-check.js  ← PreToolUse:Bash hook
```

### 4.1 `session-brief.js`（SessionStart）

**作用**：每次开新 session 时，预读 `journal.md` 顶部 3 条注入 context，让 Claude 一上来就知道项目最近在干啥，避免 Claude 自己 Read 整个 journal。

**关键代码**（`.claude/hooks/session-brief.js`）：
```js
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext  // 包含 journal 顶部 3 条 + brief 指令
  }
}));
```

**长 entry 截断**：单条超 800 字符截断 + 标注"已截断"，保持 context 可控。

### 4.2 `turn-reflect.js`（UserPromptSubmit）

**作用**：每轮对话计数 +1，命中阈值注入对应提醒：
- 每 **5** 轮 → journal 提醒（值得记的进展派后台 agent 写）
- 每 **10** 轮 → 蒸馏提醒（误解 scope / 反转链 / 反直觉结论 → 写 lesson）
- 每 **30** 轮 → 规则 review 提醒（扫 CLAUDE.md + rules/ 找重复 / 冲突）

**计数文件**：`.claude/.turn-counter`（纯文本数字，可手动 reset）

**关闭单级**：阈值改 999999；**全关闭**：删 settings 里 `hooks.UserPromptSubmit` 段。

**历史教训**（详见 journal 2026-05-26）：原本挂在 `Stop` hook 上用 `decision: 'block'`，但 Stop 的 block 必然显示 "Stop hook error" 弹框给用户（Claude Code UI 强制行为，无法压制），且 Stop hook **不支持 `additionalContext`**。改挂 UserPromptSubmit 后用 `additionalContext` 静默注入，用户 UI 完全感知不到。

### 4.3 `pre-bash-tmp-check.js`（PreToolUse:Bash）

**作用**：拦截 Bash 工具调用里的 `/tmp/` 写入操作，强制走项目内 `tmp/`（已 gitignore）。

**触发逻辑**：
1. 解析 `tool_input.command`，匹配写入模式（`cp / mv / mkdir / curl -o / rsync / wget / git clone / >  /tmp/...`）
2. 不匹配 → exit 0 放行
3. 匹配 + 项目有 `tmp/` 目录 → exit 2 阻断 + stderr 给 Claude（Claude 看到原因后改用项目路径）
4. 匹配 + 项目无 `tmp/` → exit 0 放行 + stderr 警告（不阻断）

**为什么有这个 hook**：CLAUDE.md 里的"用项目 tmp/ 不用 /tmp/"是软约束，LLM 写命令时容易忘。本文写作过程中我自己就忘了一次（`curl -o /tmp/cc-hooks-docs.html`）→ 被 hook 拦下 → 改用项目路径。这是软规则升级硬规则的典型案例。

---

## 5. 设计哲学：从软约束到硬约束

LLM 行为约束有三档强度，hook 是最强档：

| 强度 | 形式 | 失效场景 | 例 |
|------|------|---------|-----|
| 软约束 | CLAUDE.md / prompt rule | 注意力衰减时遗忘 | "不要写系统 /tmp" |
| 中等约束 | system reminder / 每轮注入 | 仍可被忽略 | vercel-plugin 提醒 |
| **硬约束** | **hook 脚本机器执行** | **不可能忘**（违反 = exit 2 = 命令失败） | `pre-bash-tmp-check` |

**判断什么时候该升级到 hook**：rule 在 5 轮内被同一个模型违反 ≥ 2 次 → 该升级。软约束治标，hook 治本。

**反向：什么时候不要用 hook**：
- 规则需要灵活判断（要看上下文 / 例外）→ 留软约束，hook 会误伤
- 规则只在某段时间内有效 → hook 全局生效，会过度
- 规则成本低 / 违反代价小 → 软约束足够，加 hook 反而增加调试负担

---

## 6. 实战陷阱

### 6.1 Stop hook 的 `reason` 必显示给用户

Stop hook 的 schema 只有 `decision` + `reason`，**没有 `additionalContext`**。`decision: 'block'` 在 UI 里会**强制弹出 "Stop hook error / feedback" 框**显示 reason 文本——这是 Claude Code 的设计（让用户知道 hook 为什么阻止了 Claude 结束），无法用 `suppressOutput` 关掉。

**结论**：要"提醒只给模型不给人看" → 不能用 Stop。改用 `UserPromptSubmit` + `additionalContext`，或 `SessionStart` + `additionalContext`。

### 6.2 `UserPromptSubmit` 的 exit 2 会擦掉用户 prompt

如 §3 所述，hook bug 时意外 exit 2 会让用户的 prompt 消失。

**防御模板**：
```js
process.stdin.on('end', () => {
  try {
    // ... 业务逻辑
  } catch (e) {
    // hook 自身 bug 不要阻塞主流程
    process.exit(0);
  }
});
```

`pre-bash-tmp-check.js` 末尾就用了这种模式。

### 6.3 改 hook 配置会触发 auto mode self-modification 守卫

修改 `.claude/settings.local.json` 的 hooks 段、`.claude/hooks/*.js` 的脚本逻辑，会被 Claude Code 的 auto mode classifier 识别为 "self-modification: editing agent configuration"，需要用户授权才能继续。

这是有意的安全设计——防止 Claude 自己悄悄关掉对自己的约束。

**应对**：要 Claude 改 hook 时，明确说"允许改 settings.local.json" / "授权改 hook"，或者在 `/permissions` 里加规则。

### 6.4 hook 配置改动建议重启 session 验证

修改 `.claude/settings.local.json` 后，**当前 session 不一定立刻应用新配置**。要稳妥验证改动，建议新开 session（或 `/clear`）再测。

hook 脚本本身（`*.js`）每次触发都重新执行，所以脚本逻辑改动通常立即生效。区别：**注册关系（settings）建议重启，脚本逻辑不需要**。

### 6.5 hook 脚本必须 fail-safe

hook 报错或 hang 住会阻塞 Claude 主流程。原则：
- 任何业务异常 → catch 住 → `exit 0` 放行（除非异常本身就是要阻断的信号）
- 不要在 hook 里跑超过 1 秒的同步 I/O（fs.readFileSync 大文件、网络请求等）
- 不要依赖 hook 之外的可变状态（数据库、远程服务）—— 不可达时 hook 会卡死

---

## 7. 扩展指引：加新 hook

### 步骤 1：选 event

按"想干什么"对应到 8 个 events 之一。常见选择：
- 拦工具调用 → `PreToolUse`（带 matcher 限定工具名）
- 自动验证工具结果 → `PostToolUse`
- 注入 context 静默 → `UserPromptSubmit` 或 `SessionStart`
- 阻止 Claude 提前结束 → `Stop`（但 reason 会弹 UI，慎用）

### 步骤 2：写脚本（健壮性模板）

基于 `pre-bash-tmp-check.js` 的模式：

```js
#!/usr/bin/env node
// 概述这个 hook 干什么
// 关闭：删 .claude/settings.local.json 的 hooks.<EventName> 段

let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    // ... 你的逻辑

    // 选 A: 静默注入（仅 UserPromptSubmit / SessionStart）
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "..."
      }
    }));
    process.exit(0);

    // 选 B: 阻断（PreToolUse / Stop 等）
    // process.stderr.write("阻断原因，给 Claude 看\n");
    // process.exit(2);
  } catch (e) {
    // hook 自身 bug 不要阻塞主流程
    process.exit(0);
  }
});
```

### 步骤 3：注册到 settings

`.claude/settings.local.json` 的 `hooks.<EventName>` 段加一项：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/your-hook.js\"" }
        ]
      }
    ]
  }
}
```

`PreToolUse` / `PostToolUse` 还可加 `matcher`（如 `"matcher": "Bash"` 限定只对 Bash 工具触发）。其他 hook 忽略 matcher。

### 步骤 4：重启 session 验证

新开 session（或 `/clear`），跑一个会触发该 hook 的动作，确认行为符合预期。

---

## 8. 调试 hook

### 8.1 hook 没触发

排查清单：
- [ ] `.claude/settings.local.json` 里 event 名拼写对了？（区分大小写：`UserPromptSubmit` 不是 `userPromptSubmit`）
- [ ] JSON 语法合法？用 `node -e "require('./settings.local.json')"` 验证
- [ ] hook 脚本路径对？用 `ls -la .claude/hooks/` 确认
- [ ] `node` 在 PATH 里？（默认有）
- [ ] 重启 session 了？

### 8.2 hook 触发但行为不符

在脚本顶部加调试日志：
```js
const fs = require('fs');
fs.appendFileSync(
  process.env.CLAUDE_PROJECT_DIR + '/tmp/hook-debug.log',
  new Date().toISOString() + ' ' + JSON.stringify(data) + '\n'
);
```

- 用项目内 `tmp/`（已 gitignore），不用系统 `/tmp/`（pre-bash-tmp-check 不拦自身 hook 的写入，但路径污染原则一致）
- 看 stdin 实际收到什么 input、看脚本执行到哪一步
- 验证 stdout 输出的 JSON 合法（`echo '...' | node -e "JSON.parse(require('fs').readFileSync(0))"`）

### 8.3 hook 把 Claude 卡死了

hook 报错或 hang 住会阻塞 Claude 主流程。应急：
1. 删 settings 里对应注册段
2. 重启 session
3. 修脚本（加 try/catch + exit 0 兜底）
4. 重新注册

---

## 9. 进一步阅读

- 官方 hooks 文档：[code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)
- 权威 schema 速查：[Claude Code Hooks Schema gist](https://gist.github.com/FrancisBourre/50dca37124ecc43eaf08328cdcccdb34)
- 本项目历史：`journal.md` 搜 "hook" / "turn-reflect"
- 全局规则：`~/.claude/rules/`（hook 升级判断、软硬约束权衡的具体场景案例）
