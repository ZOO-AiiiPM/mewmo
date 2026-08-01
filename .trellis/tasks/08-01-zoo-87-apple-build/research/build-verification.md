# ZOO-87 三 destination 无签名构建验证记录

验证环境：macOS / Xcode 26.6 / Swift 6.3.3 / XcodeGen 2.45.4。

## `xcodegen generate` 幂等性

- `project.pbxproj` 删除后重新生成，与首版**逐字节一致**。
- 唯一差异：`project.xcworkspace/xcshareddata/swiftpm/` 空目录（SwiftPM 副作用），非源码漂移，且该目录随 `Mewmo.xcodeproj/` 被 gitignore，不进 git。

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

`make verify`（= `make generate` + `make build-all`）✅ 全绿。

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
