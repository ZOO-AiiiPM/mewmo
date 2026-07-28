> agent: codex · branch: codex/subscription-prototype-uiue · 2026-07-06

编辑器优化期间记录两个需要持续回归的交互坑：空行点击 `+` 时不能先闪出一个新空行再删掉，应该直接在当前空行打开插入菜单；引用行按 Backspace 时应先解除引用格式，再继续删除内容，不能第一下就把整行删掉。
