# Implementation Plan

1. 基于最新 `origin/main`，确认 ZOO-91 数据层与共享 test target 已存在。
2. 在 XcodeGen 中添加 Nuke 13.0.6 SPM dependency，把 `Sources/Image` 纳入 app/test 编译域，并将共享 test target 调整为后续基础模块可扩展、无需重复争改同一 source list 的结构；禁止手改 xcodeproj。
3. 实现 pipeline configuration、production/test cache directory、容量配置和清理入口。
4. 使用 Nuke 原生 coalescing/cancellation/cache 能力，不复制其内部状态机。
5. 添加 mock data loader/URLProtocol tests，覆盖并发去重、取消、disk reopen、validators、LRU/clear 与错误分类。
6. 验证原始 URL cache key 语义，确认不修改 SwiftData/model。
7. 运行 `make -C apps/apple test`、`make -C apps/apple verify`、`git diff --check`。
8. 追加 concise lesson，commit/push 原 Issue branch，创建单个 PR，标题严格为 `issue-92: <简洁标题>`，Linear 转 In Review。禁止 approve、merge、deploy。

## Review Gate

- 只引入 Nuke core，不实现业务 UI。
- 不自研 downloader/LRU/coalescing 状态机。
- 测试不访问公网，磁盘测试使用临时目录并清理。
- 不修改服务端、SwiftData schema 或图片来源 URL。
