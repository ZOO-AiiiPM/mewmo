# Lessons: ZOO-91 Apple SwiftData 本地数据层

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- 本轮规划同时启动了 ZOO-91/92/93 三个 research explorers。三者重复读取 `apps/apple/project.yml`、`Makefile`、`README.md`、`.trellis/spec/dev-apple.md` 和 Linear 边界，主控随后又做了一次相同基线审计；长篇回传把共享事实重复注入主上下文，token 成本明显高于收益。
- 三份调研真正共享的关键发现只有一个：Apple 尚无 test target，91/92/93 若并行实现会共同修改 `project.yml`/`Makefile`。这个 cross-cutting constraint 应由主控先做一次 shared baseline audit，再决定批次，而不是让每个 Issue worker 独立重复发现。
- 后续规划默认由主控先读取共享基线并写入一个 task research note；只把仓库无法直接回答、且 Issue 之间互不重叠的未知点委派出去。已有 Linear spec + 明确代码边界时，不再为每个 Issue 启动 explorer。
- 必须委派调研时，prompt 限定输出预算和结构：只返回 issue-specific facts、blocking risks、owned files、acceptance gaps；禁止复述 Issue、通用工程纪律和共享验证命令。主控不再重复读取 explorer 已核实的同一事实。
- 研究 worker 只用于规划缺口，AO implementation worker 只在最终规划批准后启动。两者在 UI 和汇报中必须明确区分，避免把研究消耗误认为实现消耗。

## Implementation observations

- SwiftData（Xcode 26.6 / macOS 14 target）`FetchDescriptor` 的 predicate **不再接受 `NSPredicate`**，必须用 `#Predicate<Model> { ... }`；且 `#Predicate` 里**不能引用快照成员**（如 `snapshot.id`），要先捕获为局部 `let` 标量（否则报 `PredicateExpressions...` 泛型错误）。
- SwiftData 在 `@ModelActor` 下 insert 后立即构造值类型 snapshot 时，**属性名 `entity` 会崩** `Could not cast NSEntityDescription to NSString`；改名后 `entityName` 仍崩（`Could not cast Swift.Optional<Any> to Swift.String`）。改成与 CoreData 保留义无关的名字（`entityKind`）才稳定。教训：`@Model` 属性避免 `entity`/`entityName`，用 `entityKind` 之类。
- `@Attribute(.unique)` 用在 `MewmoSyncState.scope` 会把多账号同 scope 的状态互相覆盖（账号隔离被破坏）；正确做法是 repository 层按 `userId+scope` 显式过滤、找不到才 insert，不设单字段 unique。
- canonical fixtures 打进 test bundle：XcodeGen 用 `sources:` 下的 `buildPhase: resources` 引用 `../../packages/sync/src/fixtures`（仓库外目录）。**target 顶层 `resources:` 键 XcodeGen 不认**，会静默不打包。
- 测试里 `await` 不能用在 `XCTAssert*` 的 autoclosure 里（`await in an autoclosure`），须先 `try await` 取到局部变量再断言。
- 磁盘容器错误打开测试：SwiftData 对损坏 store 会抛错（`XCTAssertThrowsError` 可捕获），但会把 CoreData fatal 打到 stderr，不要当成测试失败。
