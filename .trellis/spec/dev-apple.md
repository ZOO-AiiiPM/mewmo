# mewmo 开发规范 · Apple 端（SwiftUI）

> 本文件描述 Apple 端的工程结构与实现约束。**已落地**（ZOO-87）的工程骨架见下方「当前结构」；尚未实现的能力（SwiftData、auth、sync、业务 UI、AI、发布）一律标注为**计划中/未来工作**，不得写成已完成。
>
> **Mac UI 交付规范**（Web 结构/token/状态/键盘到 SwiftUI 的单一真相源，含 Apple 顶部 tab strip）见 [apple/index.md](./apple/index.md) → [apple/mac-ui.md](./apple/mac-ui.md)。

## 当前结构（apps/apple，ZOO-87 已落地）

`apps/apple/` 是 XcodeGen 驱动的 Apple 工程，只承载**工程结构与构建入口**：

```
apps/apple/
├── project.yml                 # XcodeGen 真相源（唯一手工配置入口）
├── Makefile                    # 本地生成 / 构建 / 验证入口
├── README.md
├── .gitignore                  # 忽略生成的 *.xcodeproj、DerivedData 等
├── Sources/                    # 共享 SwiftUI 启动壳（无 @main，macOS/iOS 复用）
├── Entry/
│   ├── macOS/MacAppMain.swift  # macOS composition root（@main，仅 macOS target）
│   └── iOS/iOSAppMain.swift    # iOS composition root（@main，仅 iOS target）
├── Resources/{macOS,iOS}       # 各平台 Assets（AppIcon 等）
└── scripts/                    # find_sim.sh（挑模拟器）、snapshot_project.sh（幂等校验）
```

- **双 target**：`Mewmo-Mac`（macOS 14+）+ `Mewmo-iOS`（iOS 17+，`TARGETED_DEVICE_FAMILY = 1,2` → universal iPhone+iPad）。
- **生成产物非真相源**：`Mewmo.xcodeproj/` 一律 gitignore，改工程先改 `project.yml` 再 `make generate`；`make verify-idempotent` 机械校验连续生成无漂移。
- **Mac/iOS/iPad 共享核心代码**：业务源码放 `Sources/`，三端复用；平台差异用 `#if os(...)` 收敛，各自 target 目录只放入口/平台专属文件。**避免多 `@main`**：共享目录不写 `@main`，每个平台一个独立入口。

## 计划中 / 未来实现（未落地，禁止写成已完成）

- **本地缓存用 SwiftData**：启动时从本地 SwiftData 读数据显示（秒开），后台调 SyncEngine 同步。
- **网络层用 URLSession**：调后端 REST API。认证 token 存 Keychain（auth / 认证）。
- **同步协议实现必须和 Web 端行为一致**：同一组测试 fixture 验收两端。
- 业务 UI、AI 能力、发布 / 签名流程。

> 在这些能力落地前，`apps/apple/` 只保证工程能编译生成（三 destination 无签名），不提供任何业务功能。
