# ZOO-125 统一 Web 侧边栏一级入口对齐

## Goal

统一 Web 工作区侧边栏一级入口的图标列与标签列，使它们在同一条垂直基线上。

## Requirements

- 范围只包含 `apps/web/src/components/shell/Sidebar.tsx` 与对应样式中的一级导航对齐。
- mew、今天、收集箱、订阅、知识库、废纸篓的 icon 左边界完全一致，label 左边界完全一致。
- SidebarGroup 的 chevron 保留，并移出 icon / label 的内容流，不得挤占主对齐列。
- 保持现有二级项缩进、展开/收起、active、hover 与三点菜单交互不变。
- 不引入依赖，不调整信息架构，不扩大至其他侧栏或页面。

## Acceptance Criteria

- [ ] 浅色与深色主题下，六个一级入口的 icon 与 label 分别垂直对齐。
- [ ] 展开和收起收集箱、订阅、知识库不改变一级入口对齐，且二级项保持原有缩进。
- [ ] 桌面常规宽度与窄侧栏中，active、hover 和三点菜单均无被遮挡或重叠。
- [ ] 覆盖这一结构约束的回归测试通过，Web lint、主题检查、生产构建与 `git diff --check` 通过。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
