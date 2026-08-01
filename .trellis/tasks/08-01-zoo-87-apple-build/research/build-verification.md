# ZOO-87 三 destination 无签名构建验证记录

验证环境：macOS / Xcode 26.6 / Swift 6.3.3 / XcodeGen 2.45.4。

## `xcodegen generate` 幂等性

- `make verify` 的 `verify-idempotent` 步骤**机械校验**：连跑两次 `xcodegen generate`，用 `scripts/snapshot_project.sh` 把两次结果投影成「文件 + 内容」快照（跳过空的 SwiftPM 副作用目录），再 `diff -r` 逐文件比对。任何常规文件名称/内容漂移即非零退出。
- 实测：连续生成结果一致（`✅ generate idempotent: consecutive outputs identical`），`project.pbxproj` 逐字节一致。
- 负例：人为改动 `project.pbxproj` 后被 `diff` 检出并判为漂移。
- 唯一的非源码差异是 `project.xcworkspace/xcshareddata/swiftpm/` **空目录**（SwiftPM 副作用），被 `snapshot_project.sh` 排除，不视为漂移；该目录随 `Mewmo.xcodeproj/` 被 gitignore，不进 git。

## 三 destination 构建

| Destination | 命令 | 结果 |
|-------------|------|------|
| macOS | `make build-macos` | ✅ BUILD SUCCEEDED |
| iPhone simulator | `make build-ios-iphone`（iPhone 17） | ✅ BUILD SUCCEEDED |
| iPad simulator | `make build-ios-ipad`（mewmo-iPad） | ✅ BUILD SUCCEEDED |
| iOS 通用（iPhone+iPad family） | `make build-ios`（generic iOS Simulator） | ✅ BUILD SUCCEEDED |

> iPad 模拟器本机无默认，先用 `xcrun simctl create` 从 iOS 26.5 运行时创建了一个 iPad Pro 13" (M4)，供本任务验收用。

## iOS target 同时支持 iPhone/iPad

`xcodebuild -scheme Mewmo-iOS -showBuildSettings`：
- `TARGETED_DEVICE_FAMILY = 1,2`
- `SUPPORTED_PLATFORMS = iphoneos iphonesimulator`
- `SUPPORTS_MACCATALYST = NO`

## 一键验证

`make verify`（= `verify-idempotent` + `build-all`）✅ 全绿：生成幂等机械校验通过 + 三 destination 全部 BUILD SUCCEEDED。

## 仓库 CI 门禁（本地预览，未破坏现有域）

| 步骤 | 结果 | 备注 |
|------|------|------|
| `pnpm db:generate` | ✅ | 需先于 test:unit（Prisma client） |
| `pnpm lint` | ✅ | 17 tasks，0 error；`packages/db/scripts` 3 条既存无关 warning |
| `pnpm build` | ✅ | 17 tasks 全绿 |
| `pnpm test:unit` | ✅ | 17 tasks 全绿 |
| `pnpm test:theme` | ✅ | 静默通过（exit 0） |

- `apps/apple/` 无 package.json，turbo/pnpm 不将其纳入构建域，CI 不因本改动失败。
- 本地 `pnpm build` 造成 `apps/web/next-env.d.ts` 的 Next.js 副作用漂移，已在提交前还原（非任务改动）。
