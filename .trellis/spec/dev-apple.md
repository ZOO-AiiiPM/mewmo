# mewmo 开发规范 · Apple 端（SwiftUI）

> 本文件由 `agent.md` 抽出的项目专属层。以下是未来实现约束，不是当前完成度。

`apps/apple/` 尚未创建。以下是未来实现约束，不是当前完成度：

- **Mac/iOS/iPad 共享核心代码**：`mewmo/` 目录下的 Views/Models/Services/ViewModels 三端复用。平台差异代码放各自 target 目录。
- **本地缓存用 SwiftData**：启动时从本地 SwiftData 读数据显示（秒开），后台调 SyncEngine 同步。
- **网络层用 URLSession**：调后端 REST API。认证 token 存 Keychain。
- **同步协议实现必须和 Web 端行为一致**：同一组测试 fixture 验收两端。
