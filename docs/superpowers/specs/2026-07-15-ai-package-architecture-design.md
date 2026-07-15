# @mewmo/ai 产品 AI 包架构设计

## 状态与范围

- 状态：已批准，进入实现
- 范围：调整 `packages/ai`，调用方只做保持构建与迁移总结 API 所需的最小改动
- 不包含：`apps/agent`、Agent 工具与状态机、Langfuse、视频总结、流式响应、新 LLM SDK

## 背景与目标

当前 `packages/ai/src/index.ts` 同时承载 Provider 配置、模型 HTTP 调用、内容清洗、文章总结和 Agent 对话。产品总结是单步、确定性的产品能力；Agent 是独立服务中的多步执行系统，两者不能继续共用同一业务边界。

本次把 `@mewmo/ai` 收敛为产品 AI 与通用模型调用包。首期只实现文章总结，同时正式支持 OpenAI、Anthropic 和 Custom OpenAI-compatible Provider。旧 Agent 对话只保留隔离兼容层，待 `apps/agent` 接管后删除。

## 目标结构

```text
packages/ai/
├── prompts/
│   ├── agent.system.zh.md
│   └── summary.zh.md
└── src/
    ├── config.ts
    ├── prompts.ts
    ├── content/
    │   ├── normalize.ts
    │   └── types.ts
    ├── providers/
    │   ├── anthropic.ts
    │   ├── index.ts
    │   ├── openai-compatible.ts
    │   └── types.ts
    ├── summaries/
    │   ├── article.ts
    │   └── types.ts
    ├── legacy-agent.ts
    └── index.ts
```

`agent.system.zh.md` 仅为当前 Web 对话兼容而暂留，不代表 Agent 仍属于产品 AI 包。

## 公共能力

`@mewmo/ai` 导出：

- `createModelClient(options)`：创建不含 Agent 语义的统一模型客户端。
- `ModelClient.complete(input)`：发送 system + user/assistant 消息并返回文本。
- `summarizeArticle(input, options)`：清洗文章、加载总结 prompt、调用模型并返回总结。
- `summarizeContent` 与 `SummaryContentInput`：短期兼容别名，调用方迁移完成后删除。
- 旧 Agent 类型与函数：仅从 `legacy-agent.ts` 转出，行为不扩展，后续随 `apps/agent` 删除。

Provider 配置允许显式 options 覆盖环境变量。OpenAI 使用默认官方 base URL；Anthropic 使用默认官方 base URL；Custom 必须提供独立 base URL。所有 base URL 去除尾部斜杠。

## Provider 契约

- OpenAI 与 Custom 使用 OpenAI-compatible `/chat/completions`。
- Anthropic 使用 `/messages`，system 与 conversation messages 分开发送。
- 所有 Provider 支持注入 `fetch` 以便测试。
- 非 2xx 响应只暴露 provider 与状态码；错误不得包含 API key、完整响应体或用户文章正文。
- 成功响应没有文本时抛出协议错误。
- 配置不足时必须在发请求前失败；Custom 缺少 base URL 不得退回 OpenAI 默认地址。

## 文章总结

`summarizeArticle` 接受 `clip | feed_entry`、标题、来源、URL 与正文。正文继续通过现有 HTML-to-Markdown-like 清洗：移除 script/style/svg/iframe/img，保留标题、段落、引用和列表。该清洗只服务模型输入，不替代页面 XSS sanitize。

Web 与 Worker 统一迁移到 `summarizeArticle`。长耗时执行边界不变：Worker 仍消费队列，Web 当前手动重新生成接口保持原行为。

## Agent 迁移边界

本次把 Agent 历史、上下文拼装、`generateAgentReply` 和 Agent prompt 使用移入 `legacy-agent.ts`。兼容层复用统一 `ModelClient`，不再自行实现 Provider HTTP 调用。任何新 Agent 功能不得加入兼容层。

后续 `apps/agent` 接管现有 Web 对话后，删除兼容层、Agent prompt 和所有 Agent 导出。

## 验收标准

- Provider、内容清洗、文章总结与旧 Agent 兼容层物理隔离。
- OpenAI、Anthropic、Custom 三种 Provider 的请求格式和文章总结有测试。
- Custom base URL 为必填，错误响应不泄漏密钥或正文。
- Web/Worker 总结调用方使用 `summarizeArticle`。
- 旧 Web Agent 对话保持可构建、可调用，但不新增能力。
- `@mewmo/ai`、Worker、Web 相关测试、lint 与 build 通过。
