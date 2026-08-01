# ZOO-87 调研与工程教训

记录本任务沉淀的可复用工程知识，供 `apps/apple/` 后续迭代与未来 Apple 工程参考。

## 环境事实

- 验证环境：macOS、Xcode 26.6、Swift 6.3.3、XcodeGen 2.45.4（`brew install xcodegen`）。
- 本机默认无 iPad 模拟器，只有 iPhone。可用现成运行时创建 iPad 模拟器：
  ```bash
  xcrun simctl create "mewmo-iPad" \
    "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB" \
    "com.apple.CoreSimulator.SimRuntime.iOS-26-5"
  ```
  `xcrun simctl list devicetypes` 可列出可用的 iPad device type。

## XcodeGen 关键点

- **真相源**：`project.yml` 是唯一手工配置入口；生成的 `Mewmo.xcodeproj/` 一律 `.gitignore`，改工程先改 `project.yml` 再 `make generate`。
- **多 `@main`**：共享 `Sources/` 里不写 `@main`，每个平台一个独立入口文件（`Entry/macOS/MacAppMain.swift`、`Entry/iOS/iOSAppMain.swift`），XcodeGen 给每个 target 单独 assign sources 集合，规避多 `@main` 冲突。
- **Info.plist**：用 `GENERATE_INFOPLIST_FILE: YES` 让 XcodeGen/Xcode 自动生成，避免手工维护 plist。
- **universal iOS（iPhone+iPad）**：iOS target settings 设 `TARGETED_DEVICE_FAMILY: "1,2"`、`SUPPORTED_PLATFORMS: "iphoneos iphonesimulator"`；用 `xcodebuild -showBuildSettings` 可核对 `${TARGETED_DEVICE_FAMILY}=1,2`。
- **无签名可复现**：新 target 默认不开签名，构建命令统一带 `CODE_SIGNING_ALLOWED=NO` 兜底，零证书机器可复现。

## XcodeGen 生成确定性

`project.pbxproj` 重复生成**逐字节一致**（幂等）。唯一差异是 `project.xcworkspace/xcshareddata/swiftpm/` 空目录（SwiftPM 构建副作用），非源码漂移，且该目录同属被 gitignore 的 `Mewmo.xcodeproj/`，不进 git。验收"可重复生成"看 `project.pbxproj` 一致性即可。

## Makefile 坑（易复发）

- **`$(...)`` 命令替换不能放在单引号内**：`-destination 'platform=iOS Simulator,id=$(find_sim.sh ...)'` 内的替换不会执行（单引号内不展开）。正确做法：
  ```make
  build-ios-iphone: $(PROJECT)
  	@ios_sim=$$($(FIND_SIM) iphone) || exit 1; \
  	$(XCODEBUILD) -scheme $(SCHEME_IOS) \
  		-destination "platform=iOS Simulator,id=$$ios_sim" \
  		CODE_SIGNING_ALLOWED=NO build
  ```
  （Makefile 里 `$$` 转义为字面 `$`；先算进变量，再用双引号展开。）
- Makefile 目标依赖 `$(PROJECT)` 可自动触发 `xcodegen generate`，保证改了 `project.yml` 后构建前自动重新生成。

## 模拟器 destination 稳定性

- 指定具体设备名（`name=iPhone 17`）依赖设备存在；异构机器上设备名/ID 不同。
- 本任务用 `scripts/find_sim.sh <iphone|ipad>` 在运行时自动挑选已安装对应 family 模拟器的 identifier，再拼成 `platform=iOS Simulator,id=<id>` destination，跨机器可复现。
- 通用兜底：`-destination 'generic/platform=iOS Simulator'` 只验证 iOS Simulator SDK，不特定区分 iPhone/iPad family；验收"iPhone、iPad 均可编译"需对两个 family 分别挑设备构建。

## 与 monorepo / CI 的关系

- `apps/` 下现有包都进 pnpm workspace（`pnpm-workspace.yaml` 的 `apps/*`）。`apps/apple/` **没有 package.json**，所以 pnpm/turbo 不会把它当 workspace 包——`pnpm lint/test/build` 不触碰它（已用本地跑通验证）。
- **Linux CI（ubuntu-latest）无法跑 xcodebuild**：`apps/apple` 不进 turbo 的 `pnpm` 构建域；三 destination 无签名构建验证只能在本机 macOS 完成。CI 门禁对新增 `apps/apple/` 应保持全绿。

## 本地仓库 CI 本地预览

- `pnpm lint`（本项目实际用 `pnpm lint`，非脚本名字面的 eslint-only）跑通，`packages/db/scripts` 有 3 条**既存无关 warning**（unused eslint-disable），非本任务引入。
- `pnpm test:unit` 直接跑会因未生成 Prisma client 失败：需先 `pnpm db:generate`（CI 的 job 顺序就是 lint → build → test:unit 前先 `db:generate`）。生成后再跑即全绿。
- 本地 `pnpm build` 会改 `apps/web/next-env.d.ts`（`dev/types` → `types`，Next.js 副作用）——**该文件是 build 产物，不属于任务改动**，提交前应 `git checkout -- apps/web/next-env.d.ts` 还原，避免无关漂移混入 PR。

## 验收如何核对

- `xcodebuild -project Mewmo.xcodeproj -scheme Mewmo-iOS -showBuildSettings`：核对 `TARGETED_DEVICE_FAMILY = 1,2`、`SUPPORTED_PLATFORMS = iphoneos iphonesimulator`。
- `make verify`（generate + 三 destination 全绿）即验收跑步集合。
