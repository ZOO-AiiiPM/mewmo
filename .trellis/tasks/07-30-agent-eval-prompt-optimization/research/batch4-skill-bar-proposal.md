# Research: Batch 4 — Skill 栏 Feature（交互方案）

- **Query**: 将深度洞察按钮从 Composer 内部移至输入框上方，建立 Skill 栏/选择器结构
- **Scope**: internal（前端 + 后端代码现状分析 + 交互方案设计）
- **Date**: 2026-07-30

---

## 一、现状梳理

### 1.1 前端：深度洞察按钮实现

| 文件 | 职责 |
|---|---|
| `apps/web/src/components/agent/ChatInput.tsx` | 渲染深度洞察按钮、管理 skillId 状态 |
| `apps/web/src/components/agent/AgentSidebar.tsx` | 中间传参层，透传 requestedSkill / onDeepInsight |
| `apps/web/src/components/shell/AISidebar.tsx` | 顶层状态管理，`openDeepInsight()` 设置 requestedSkill |
| `apps/web/src/lib/agent/conversation-store.ts` | `SendOptions.skillId` 字段 |
| `apps/web/src/lib/agent/stream-client.ts` | 最终发送 body 包含 skillId |
| `apps/web/src/app/api/agent/chats/[id]/messages/route.ts` | BFF 转换 skillId→upstream `skill` 字段 |
| `apps/web/src/app/globals.css:4941-4971` | `.mewmo-chat-input__insight` 样式（pill 形，28px 高，999px 圆角） |

**按钮当前位置**：在 `ChatInput.tsx` 的 `.mewmo-chat-input__toolbar > .mewmo-chat-input__tools` 中（即输入框**内部**底部工具栏），与上传按钮、深度思考按钮并排。

**激活逻辑**：
```
点击 → onDeepInsight() → AISidebar.openDeepInsight()
  → setRequestedSkill("deep-insight") → ChatInput useEffect 响应
  → setSkillId("deep-insight") + 填充默认提示词
  → 发送时在 body 包含 skillId
  → 发送后 setSkillId(undefined) — 单次消耗
```

**状态表达**：选中时加 `--active` 类（紫色边框 + 浅色背景）。再次点击取消 skillId。

**限制条件**：`showInsight` prop 控制是否显示此按钮（mew 独立页不显示）。当没有 context 且 skillId 为空时按钮 disabled。

### 1.2 后端：Skill 数据结构与激活链路

| 文件 | 职责 |
|---|---|
| `apps/agent/src/prompt-loader.ts` | `AgentSkillResource` 接口 + `loadPresetSkills()` |
| `apps/agent/src/pi/runtime.ts:56-68` | 通过 skillId 查找 skill → 切换 prompt/model/tools |
| `apps/agent/src/contracts.ts:26-38` | `sendMessageBodySchema` 定义 skillId 字段 |
| `apps/agent/src/ports.ts:129-138` | `ApplicationPort.skills.list` 接口 |
| `apps/agent/src/adapters.ts:104-115` | 适配器实现，合并 preset + custom skills |
| `apps/agent/prompts/skills/deep-insight.zh.md` | 深度洞察技能的 prompt 内容 |

**AgentSkillResource 结构**：
```typescript
interface AgentSkillResource {
  id: string;              // e.g. "preset:deep-insight"
  name: string;            // e.g. "deep-insight"（用于匹配 skillId）
  description: string;     // 给用户的中文简述
  content: string;         // skill prompt 正文
  filePath: string;        // prompt 文件路径
  modelPurpose: "agent.chat" | "agent.deep_insight"; // 决定用哪个模型
  allowedTools: string[];  // 限制此 skill 可调用的工具集
}
```

**激活链路（后端）**：
```
runtime.run()
  → resolveSkills() — 合并 loadPresetSkills() + application.skills.list()
  → 若 request.skillId 存在 → find(skill.name === skillId || skill.id === skillId)
  → 找不到则抛 bad_request
  → 选中 skill 决定：
      1. modelPurpose → 选取模型
      2. allowedTools → 限制工具
      3. 加载特定 prompt（目前硬编码 preset:deep-insight → deep-insight.zh prompt）
      4. thinkingLevel → deep_insight 或 thinking=true 时升为 "medium"
  → harness.skill(name, content) vs harness.prompt(content)
```

**关键设计点**：
- 后端已支持多 skill（resolveSkills 合并 preset + custom）
- `ApplicationPort.skills.list` 可返回用户自定义 skill（目前无实现，返回空数组）
- 前端当前只硬编码了 deep-insight 一个 skillId

---

## 二、交互方案

### 方案 A：输入框上方 Pill 式 Skill 栏（推荐 ✅）

**描述**：在 `.mewmo-chat-input` 容器内、`.mewmo-chat-input__box` 之前插入一行水平滚动的 pill 按钮栏。每个 pill 代表一个 skill。

**布局草图**：
```
┌─────────────────────────────────────┐
│  [✨ 深度洞察] [🔗 关联分析] ...     │  ← skill 栏（pill 按钮，水平滚动）
├─────────────────────────────────────┤
│  [context chip]                      │
│  textarea                            │
│  [📎 upload] [💡深度思考]    [发送▶] │  ← 原有 toolbar（移除深度洞察按钮）
└─────────────────────────────────────┘
```

**选中态**：
- 未选中：ghost pill（透明底 + 1px border + 浅色文字）
- 选中：`--active` 态（accent 底色 + 白色图标/文字 + ✕ 关闭图标）
- 只允许同时选中一个 skill（radio 模式），再次点击或点 ✕ 取消

**改动面**：

| 层 | 改动文件 | 内容 |
|---|---|---|
| 前端组件 | `ChatInput.tsx` | 新增 `<SkillBar>` 区域或内联渲染；移除 toolbar 里的深度洞察按钮 |
| 前端样式 | `globals.css` | 新增 `.mewmo-skill-bar` / `.mewmo-skill-pill` 等 class |
| 前端状态 | `AISidebar.tsx` | 将 `requestedSkill` 逻辑移至 skill 栏，不再需要 `openDeepInsight` 回调 |
| 后端 | 无改动 | skillId 传参方式不变 |

**优点**：
- 始终可见，降低操作认知成本（不需要先点击才知道有什么 skill）
- 符合用户 #11 反馈"移到输入框上方"的字面诉求
- 水平滚动可自然扩展新 skill
- 改动集中在前端，后端零修改

**缺点**：
- 侧栏宽度有限（通常 360-400px），skill 多时需横向滚动
- 始终占据 ~36px 垂直空间（在无 skill 可用时可隐藏）

---

### 方案 B：弹出式 Skill 选择器（Popover / Command Palette）

**描述**：保留一个入口按钮（如 ⚡ 图标）在 toolbar 内，点击弹出 popover 列表展示所有可用 skill。

**布局草图**：
```
┌─────────────────────────────────────┐
│  [context chip]                      │
│  textarea                            │
│  [📎] [💡思考] [⚡ Skill▾]   [发送▶]│
└───────────────┬─────────────────────┘
                │  ┌──────────────┐
                └──│ ✨ 深度洞察  │
                   │ 🔗 关联分析  │
                   │ ...          │
                   └──────────────┘
```

**选中态**：
- 选中后 popover 关闭；toolbar 中入口按钮变为已选 skill 的名称 + ✕
- 或在 textarea 上方出现临时提示条

**改动面**：与方案 A 相似，但额外需要一个 popover 组件（或复用已有 dropdown）。

**优点**：
- 不占用额外垂直空间（适合侧栏空间紧张）
- skill 列表可包含描述文字，信息密度高

**缺点**：
- 多一次交互（点击才能看到 skill 列表）→ 不如方案 A 直观
- 选中态反馈不如 pill 栏明显，需额外元素表达

---

### 方案 C：混合式（Pill 栏 + 溢出 More）

**描述**：显示前 2-3 个最常用 skill 为 pill，剩余收入 `+更多` 按钮的 popover。

**优点**：兼具可见性和扩展性。
**缺点**：实现复杂度最高；当前只有一个 skill 时退化为方案 A。

---

## 三、推荐方案：A — Pill 式 Skill 栏

**理由**：
1. 直接解决用户反馈（按钮移到输入框上方，一目了然）
2. 当前仅 1 个 skill，pill 栏简洁直观
3. 后端零改动，风险最低
4. 扩展第二个 skill 时，只需在 pill 数据源追加一项
5. 若未来 skill 超过 4-5 个，可渐进升级为方案 C

---

## 四、选中 Skill 后的状态管理

### 4.1 选中态 UI

| 状态 | 视觉表现 |
|---|---|
| 空闲（未选 skill） | 所有 pill 为 ghost 态 |
| 已选中一个 skill | 该 pill 变为 active（accent 背景 + 右侧 ✕ icon）；其余 pill 保持 ghost |
| 已选中 + 正在发送 | pill 栏整体 disabled / 降低不透明度 |

### 4.2 随消息发送

- 发送时将 `skillId` 包含在 `onSend` payload 中（现有逻辑不变）
- 发送完成后自动清除 skillId（单次消耗模式，同当前行为）

### 4.3 取消选中

- 再次点击已选 pill → 取消
- 点击 pill 右侧 ✕ → 取消
- 手动清空 textarea + 按 Esc → 可选：自动取消

### 4.4 默认提示词填充

- 选中 skill 时自动填充该 skill 的默认提示词（如当前深度洞察的逻辑）
- 若 textarea 已有用户输入，不覆盖（保留 `current || defaultPrompt` 逻辑）

---

## 五、新增 Skill 的扩展方式

### 5.1 后端

1. **新增 prompt 文件**：`apps/agent/prompts/skills/<skill-name>.zh.md`
2. **注册到 loadPresetSkills()**：在 `prompt-loader.ts` 中追加新对象到返回数组
3. **注册到 langfuse manifest**（若需要 Langfuse 版本管理）：`prompts/langfuse-manifest.json`
4. **runtime.ts 中加载逻辑**：目前硬编码 `preset:deep-insight` 来选择 prompt link，需改为通用映射或在 AgentSkillResource 中增加 `promptLinkId` 字段

### 5.2 前端

1. **Skill 列表数据源**：
   - 短期：在 ChatInput 中硬编码 skill 列表（`[{ id: "deep-insight", label: "深度洞察", icon: "spark" }, ...]`）
   - 中期：通过 API 获取 skills 列表（`GET /api/agent/skills`），后端返回 `resolveSkills()` 的子集（name + description + icon）
2. **组件**：skill 栏是纯展示 + 选择，不关心 skill 内部逻辑

### 5.3 扩展清单（新增第二个 skill 需改的文件）

| 文件 | 改动 |
|---|---|
| `apps/agent/prompts/skills/new-skill.zh.md` | 新建 prompt |
| `apps/agent/src/prompt-loader.ts` | loadPresetSkills 追加条目 |
| `apps/agent/src/pi/runtime.ts:68` | prompt link 选择改为通用查找 |
| `apps/agent/prompts/langfuse-manifest.json` | 注册新 prompt |
| `apps/web/…/ChatInput.tsx` (或 skill 栏组件) | 追加 pill 条目 |

---

## 六、实施拆分建议

### Phase 1 — 前端 Skill 栏 UI（无后端改动）

| 步骤 | 文件 | 描述 |
|---|---|---|
| 1 | `ChatInput.tsx` | 在 `<form>` 之前渲染 skill 栏；skill 列表暂为硬编码数组 |
| 2 | `ChatInput.tsx` | 移除 toolbar 内深度洞察按钮（`.mewmo-chat-input__insight` 对应的深度洞察 btn） |
| 3 | `globals.css` | 新增 `.mewmo-skill-bar` `.mewmo-skill-pill` `.mewmo-skill-pill--active` 样式 |
| 4 | `AISidebar.tsx` | 简化 `openDeepInsight` 回调（可保留或移除，skill 栏直接 setState） |
| 5 | `AgentSidebar.tsx` | 对应 props 透传调整 |

**预估样式结构**：
```css
.mewmo-skill-bar {
  display: flex;
  gap: 6px;
  padding: 0 2px 6px;
  overflow-x: auto;
  scrollbar-width: none; /* hide scrollbar */
}
.mewmo-skill-pill { /* 复用现有 .mewmo-chat-input__insight 样式 */ }
.mewmo-skill-pill--active { /* 复用 --active 样式 */ }
```

### Phase 2 — 后端 Skill 列表 API（可选，为动态列表做准备）

| 步骤 | 文件 | 描述 |
|---|---|---|
| 1 | `apps/web/src/app/api/agent/skills/route.ts` | 新 API route：调用 agent server 获取 skill 列表 |
| 2 | `apps/agent/src/server.ts` | 新增 `GET /v1/skills` 端点 |
| 3 | 前端 hook | `useAgentSkills()` — 获取可用 skill 列表 |
| 4 | `ChatInput.tsx` | skill 栏改为动态渲染 |

### Phase 3 — runtime 通用化 prompt link 选择

| 步骤 | 文件 | 描述 |
|---|---|---|
| 1 | `AgentSkillResource` | 新增 `promptLinkId?: string` 字段 |
| 2 | `runtime.ts:68` | 将硬编码映射改为 `skill.promptLinkId ?? "agent/system.zh"` |

---

## 七、注意事项 / Caveats

1. **mew 页面**：`apps/web/src/app/(app)/mew/page.tsx` 使用 `showInsight={false}` 隐藏深度洞察按钮。改为 skill 栏后需确认该页面是否完全不显示 skill 栏，还是显示其他 skill。
2. **context 依赖**：当前深度洞察按钮在无 context 时 disabled。skill 栏中的 pill 是否同样需要 context 才能点击？建议：点击仍然允许（用户可能直接提问），但仅在 "深度洞察" 且无 context 时 disabled。
3. **BFF skill 字段兼容**：`route.ts` 中硬编码了 `"deep-insight" ? "deep-insight" : "general"` 映射。新增 skill 后需改为直接透传 skillId（后端 contracts.ts 已有 .transform() 做兼容）。
4. **深度思考 vs 深度洞察**：这两个功能当前视觉几乎相同（同一个 `.mewmo-chat-input__insight` class）。方案 A 只把 "深度洞察"（skill）移出，"深度思考"（thinking toggle）保留在 toolbar 内——它们性质不同：thinking 是持续 toggle，skill 是单次消耗。
5. **Langfuse prompt link**：目前 `runtime.ts:68` 硬编码了 deep-insight prompt 路径，新增 skill 前必须通用化。
