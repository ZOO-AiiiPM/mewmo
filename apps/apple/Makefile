# Mewmo Apple 工程本地构建入口。
# 用法见 README.md。所有 target 默认无签名（CODE_SIGNING_ALLOWED=NO），可在零证书机器复现。

SHELL := /usr/bin/env bash
PROJECT   := Mewmo.xcodeproj
SCHEME_MAC  := Mewmo-Mac
SCHEME_IOS  := Mewmo-iOS
SCHEME_TEST := Mewmo-Tests
DERIVED     := DerivedData
XCODEBUILD  := xcodebuild -project $(PROJECT) -derivedDataPath $(DERIVED)
FIND_SIM    := scripts/find_sim.sh

.PHONY: generate build-macos build-ios build-ios-iphone build-ios-ipad build-all test verify-idempotent verify clean

## 生成 Xcode 工程（project.yml 是唯一真相源）
generate:
	@xcodegen generate

$(PROJECT): project.yml
	@xcodegen generate

## 无签名构建 macOS app
build-macos: $(PROJECT)
	@$(XCODEBUILD) -scheme $(SCHEME_MAC) \
		-destination 'platform=macOS' \
		CODE_SIGNING_ALLOWED=NO build

## 无签名构建 iOS（通用 iPhone+iPad family，iOS Simulator SDK）
build-ios: $(PROJECT)
	@$(XCODEBUILD) -scheme $(SCHEME_IOS) \
		-destination 'generic/platform=iOS Simulator' \
		CODE_SIGNING_ALLOWED=NO build

## 无签名构建 iPhone simulator（自动挑选已安装的 iPhone 模拟器）
build-ios-iphone: $(PROJECT)
	@ios_sim=$$($(FIND_SIM) iphone) || exit 1; \
	$(XCODEBUILD) -scheme $(SCHEME_IOS) \
		-destination "platform=iOS Simulator,id=$$ios_sim" \
		CODE_SIGNING_ALLOWED=NO build

## 无签名构建 iPad simulator（自动挑选已安装的 iPad 模拟器）
build-ios-ipad: $(PROJECT)
	@ipad_sim=$$($(FIND_SIM) ipad) || exit 1; \
	$(XCODEBUILD) -scheme $(SCHEME_IOS) \
		-destination "platform=iOS Simulator,id=$$ipad_sim" \
		CODE_SIGNING_ALLOWED=NO build

## 三 destination 全量无签名构建（macOS + iPhone + iPad）
build-all: build-macos build-ios-iphone build-ios-ipad
	@echo "✅ build-all: macOS / iPhone / iPad all passed"

## 共享 macOS unit-test 门禁（ZOO-91）：运行 Mewmo-Tests 里的 SwiftData 本地数据层测试
test: $(PROJECT)
	@$(XCODEBUILD) -scheme $(SCHEME_TEST) \
		-destination 'platform=macOS' \
		CODE_SIGNING_ALLOWED=NO \
		-skipPackagePluginValidation test

## 生成幂等性：连跑两次 xcodegen，逐文件（内容 + 文件名集合）比对，
## 任何漂移（diff 非空）即非零退出。空的 SwiftPM 副作用目录不算漂移。
## 临时文件/快照每 run 用 mktemp 私有命名，并由 trap 兜底清理：
## - 并行 worktree/session 互不竞争同一个固定路径；
## - 异常退出（如 diff 失败）不残留临时目录/文件。
verify-idempotent: $(PROJECT)
	@tmp=$$(mktemp -d); trap 'rm -rf "$$tmp"' EXIT; \
	snap1="$$tmp/gen"; snap2="$$tmp/gen2"; drift="$$tmp/drift.diff"; \
	rm -rf Mewmo.xcodeproj; \
	xcodegen generate --quiet; \
	./scripts/snapshot_project.sh Mewmo.xcodeproj "$$snap1"; \
	rm -rf Mewmo.xcodeproj; \
	xcodegen generate --quiet; \
	./scripts/snapshot_project.sh Mewmo.xcodeproj "$$snap2"; \
	if diff -r "$$snap1" "$$snap2" >"$$drift" 2>&1; then \
		echo "✅ generate idempotent: consecutive outputs identical"; \
	else \
		echo "❌ generate DRIFT detected:"; cat "$$drift"; exit 1; \
	fi

## 完整验收：生成幂等校验 + 三 destination 全绿 + 共享 unit-test 全绿
verify: verify-idempotent build-all test
	@echo "✅ verify: generate idempotent + 3 destinations + unit tests all passed"

clean:
	@rm -rf $(DERIVED)
