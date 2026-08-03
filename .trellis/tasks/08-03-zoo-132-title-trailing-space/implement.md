# Implementation Plan

1. 将标题输入时的单行处理限制为换行符，不在编辑态规范化普通空白。
2. 保留失焦与 Enter 提交时现有的 `normalizeTitleText()` 行为。
3. 运行聚焦单测、lint 和浏览器交互验收，确认末尾空格、连续空格及 IME Enter。
