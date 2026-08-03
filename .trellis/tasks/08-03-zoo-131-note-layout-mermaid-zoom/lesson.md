# Bug Analysis: 多 Mermaid 块永久停在 Loading

### 1. Root Cause Category

- **Category**: E - Implicit Assumption / D - Test Coverage Gap
- **Specific Cause**: renderer 被误当成单个代码块实例，实际一个 config renderer 服务页面内全部代码块；全局 generation 将其他块的正常结果判为 stale。

### 2. Why Fixes Failed

1. 初版 race protection 只测试同一回调的并发结果，没有覆盖两个独立代码块同时挂载。
2. Pan/zoom 改动沿用了既有 renderer，没有重新核对 Crepe 创建 `applyPreview` 回调的生命周期。
3. 深色主题测试只检查父级 `text` 和 `foreignObject`；sequence diagram 把参与者颜色直接写在子级 `tspan`，父级颜色无法覆盖。

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|----------|-----------|-----------------|--------|
| P0 | Architecture | 无 block identity 时串行 Mermaid render，禁止全局 latest-token 丢结果 | DONE |
| P0 | Test | 两个独立 `applyPreview` 同时渲染且都必须完成 | DONE |
| P0 | Test | Mermaid SVG 文字主题覆盖必须包含 `text > tspan` | DONE |
| P1 | Spec | 记录 Crepe renderer 与回调生命周期 | DONE |

### 4. Systematic Expansion

- **Similar Issues**: 其他挂在共享 editor config 上的异步 renderer。
- **Design Improvement**: 将共享 renderer 的并发策略视为多消费者队列，不假设每次回调拥有稳定身份。
- **Process Improvement**: 异步 UI renderer 测试至少覆盖同组件更新与两个并行实例。

### 5. Knowledge Capture

- [x] 更新 `.trellis/spec/dev-frontend.md`
- [x] 在 ZOO-131 原任务、分支和 PR 内补回归测试
- [x] 当前仓库没有 `src/templates/markdown/spec/`，无需同步模板
