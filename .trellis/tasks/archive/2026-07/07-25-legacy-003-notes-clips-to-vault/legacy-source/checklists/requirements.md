# Specification Quality Checklist: 笔记 / 剪藏切到 Vault Markdown

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-28
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
  > Partial pass：FR 段含「macOS」「Tauri identifier」「FTS5」「jieba tokenizer」「mkdir-mutex」等用户可识别的产品概念名 / 沿用 spec 002 已选型技术；纯实现细节都在 plan / Assumptions 段引用
- [x] Focused on user value and business needs
  > 3 个 user story 各自带「Why this priority」段，每条都从用户视角描述价值（笔记永远属于我 / 剪藏 Obsidian 能开 / 搜索仍能用）
- [x] Written for non-technical stakeholders
  > Partial pass：本 spec 性质是工程重构（数据归属切换），部分 FR 涉及 SQL DROP / FTS5 / atomic rename 术语，但用户旅程段全部用业务语言描述
- [x] All mandatory sections completed
  > User Scenarios & Testing / Requirements / Success Criteria / Assumptions 四段全填

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
  > 0 个 NEEDS CLARIFICATION：dogfood 阶段事实 + 架构 v1.0 + spec 002 已落地 + 用户已明确「不写迁移代码」「不写保险机制」「AI 推 spec 004」「订阅 AI 检索推 spec 004」 — 所有可能的模糊点都已敲定
- [x] Requirements are testable and unambiguous
  > 19 个 FR + 5 个 NFR（不在范围声明）全部 testable + 不模糊；具体行为描述（「禁止读写 vibe.db notes 表」「Obsidian 渲染正常」）有可观测验收
- [x] Success criteria are measurable
  > 10 个 SC 全部含具体度量（≤ 1s / ≤ 200ms / 0 起 / 100% / ≥ 90% 等）
- [x] Success criteria are technology-agnostic (no implementation details)
  > Partial pass：SC-007 提「ripgrep 扫 commands/notes.rs」是验收路径，含技术细节但是 verifiable 标准；其他 SC 走 user-facing 度量
- [x] All acceptance scenarios are defined
  > 3 个 user story 共 19 个 acceptance scenario（US1 7 + US2 6 + US3 6），覆盖正常流 + 边界 + 失败模式
- [x] Edge cases are identified
  > 9 条 edge case，覆盖 vault 未初始化 / 空标题 / 文件名冲突 / 高频自动保存 / 外部移动 / 外部删除 / 剪藏失败 / 零结果 / index 损坏
- [x] Scope is clearly bounded
  > Spec 顶部 Scope 边界段 + NFR-A~E 显式声明「不在范围」 + Assumptions 段三向引用说明「不在范围」3 项（AI 后端化 / 订阅 AI 检索 / 订阅源迁移）
- [x] Dependencies and assumptions identified
  > Assumptions 段四类：项目阶段事实 / 架构 v1.0 / 宪法 / 工程边界；明确依赖 spec 002 vault 骨架 + dogfood 单用户事实

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
  > 19 个 FR 各对应至少一个 acceptance scenario 或 edge case
- [x] User scenarios cover primary flows
  > 3 个 P1-P3 user story 覆盖独立 testable 价值切片：笔记 vault / 剪藏 vault / 搜索 vault
- [x] Feature meets measurable outcomes defined in Success Criteria
  > FR ↔ SC 双向映射可查（如 FR-001/006 ↔ SC-001/002 / FR-010/012 ↔ SC-005 / FR-001/006 ↔ SC-007）
- [x] No implementation details leak into specification
  > Partial pass：spec 主体引 vault/io.rs / clip_parser.rs / vault-meta.db 等 spec 002 已落地的实现位置，是为 verifiability，不是新决策

## Notes

- 4/16 项 partial pass，根因同 spec 002 / spec 003 旧版：本 spec 性质是工程重构 + 数据归属切换，部分 FR / SC 必然涉及用户可观测的产品概念（vault 文件夹 / Obsidian / SQL 表）—— 这些是用户视角可识别的边界，不是「纯实现细节」
- **0 NEEDS CLARIFICATION 阻塞**：dogfood 阶段事实明确，可直接进 `/speckit-plan`
- **跟旧版（已废）的对比**：旧版 28 FR + 15 SC + 4 道保险（备份 / 双读 / soft-delete / cleanup 推迟）+ 「一键清空」UI 按钮 → 新版 19 FR + 10 SC + 砍光所有保险机制 + 数据搬迁推到 plan 阶段（Claude 跑一次性脚本不进 app bundle）
- **建议下一步**：可直接 `/speckit-plan` 或先校验目录名是否要改成 `003-notes-clips-to-vault`（更贴新 scope）
