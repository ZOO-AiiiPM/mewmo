# Sub-agent 的 prompt 指令会盖过 CLAUDE.md 项目规则

## 现象

派 sub-agent 写 memory 文件时，我在 prompt 里直接说"请新建 feedback_temp_files.md"。sub-agent 看到了项目 CLAUDE.md 里"禁止 feedback_*.md"的禁令，但仍然按我的指令创建了这个被禁止的文件，并在返回结果里附上 "SECURITY WARNING: violated stated user boundary" 警告。

## 反直觉的地方

我以为：CLAUDE.md 是项目硬规则 → sub-agent 也会读 → 它会替我把关，自动把 feedback_*.md 改成合规路径（如 .claude/rules/{主题}.md 或 CLAUDE.md 项目硬规则段）。

实际上：sub-agent 把"用户 prompt 里的明确指令"优先级置于"项目规则"之上——指令冲突时它会执行你说的，最多在结果里发个警告。这等于规则在 sub-agent 链路上**没有兜底能力**。

## 根因

主 agent 跑 Bash / Edit 时，CLAUDE.md 是会自动加载到 system prompt 的硬约束，模型不会主动违反。但 sub-agent 派遣是另一种"我在替主 agent 跑一个子任务"的语义——它会把你 prompt 里的指令当作"用户已经在主层判断过、要求我执行"的命令，规则只是它内部的二次校验，不是阻断。

## 该怎么做

派 sub-agent 之前，**prompt 本身就要满足项目规则**——把规则在派遣前就内化进指令里，而不是指望 sub-agent 帮你检查。具体：

1. 写 sub-agent prompt 前先在脑里走一遍："这条指令如果直接执行会不会违反 CLAUDE.md 任一硬规则？" 违反就先在主层修正再派。
2. 涉及"写到 .claude/memory/"、"写到 docs/"、"删除 X" 这类有规则约束的目录操作时，先查项目 CLAUDE.md 写入分层 / 项目硬规则段。
3. 不要把"让 sub-agent 帮我决定路径 / 文件名"作为偷懒手段。路径决策必须主层做完再派。

## 跨项目通用化

这个教训不局限于本项目：任何"主 agent 派 sub-agent 写文件"的场景，都该假设 **sub-agent 会优先执行 prompt 指令、不会用项目规则兜底**。同类规则（"禁止 X 类文件"、"目录约束"）必须在主层就把指令调对。
