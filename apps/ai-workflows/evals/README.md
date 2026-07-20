# AI Workflow 评测

离线评测不调用模型，用于校验 prompt 版本、输出契约和数据集结构：

```bash
pnpm --filter @mewmo/ai-workflows eval:offline
```

Live 评测调用真实 `packages/ai` Runtime，并使用官方 Langfuse Experiment API + OpenTelemetry Span Processor 写入 trace 与 score：

```bash
LANGFUSE_PUBLIC_KEY=pk_... \
LANGFUSE_SECRET_KEY=sk_... \
LANGFUSE_BASE_URL=https://cloud.langfuse.com \
AI_PROVIDER=openai \
OPENAI_API_KEY=... \
AI_MODEL_SUMMARY=... \
AI_MODEL_EVAL_JUDGE=... \
pnpm --filter @mewmo/ai-workflows eval:live
```

默认读取仓库内 `evals/datasets/summary-cases.json`。设置 `LANGFUSE_DATASET_NAME` 后，改为读取 Langfuse 中的版本化 Dataset，并生成可比较的 Dataset Run；`LANGFUSE_DATASET_VERSION` 可固定到 ISO 时间版本。远端 item 格式为：

```json
{
  "input": { "id": "case-id", "category": "injection", "content": "待摘要正文" },
  "expectedOutput": {
    "requiredPhrase": "可选的必含短语",
    "forbiddenPhrases": ["可选的禁用短语"],
    "facts": ["可选的必须保留事实"]
  }
}
```

确定性 contract/phrase/fact 分数是硬门槛；`eval.judge` 记录忠实度、覆盖度、指令遵循和可读性的趋势分数，首版不作为硬门槛，等待人工标注校准。`EVAL_FAIL_BELOW` 默认是 `1`，任一硬门槛低于阈值、模型任务缺失或没有生成评分时命令退出非零。`EVAL_MAX_CONCURRENCY` 默认是 `2`，避免一次评测触发过多模型并发。Langfuse 不在生产 Agent/Workflow 的关键路径，评测平台故障不会阻断用户功能。
