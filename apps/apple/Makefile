# Mewmo Apple 工程本地构建入口。
# 用法见 README.md。所有 target 默认无签名（CODE_SIGNING_ALLOWED=NO），可在零证书机器复现。

SHELL := /usr/bin/env bash
PROJECT   := Mewmo.xcodeproj
SCHEME_MAC := Mewmo-Mac
SCHEME_IOS := Mewmo-iOS
DERIVED   := DerivedData
XCODEBUILD := xcodebuild -project $(PROJECT) -derivedDataPath $(DERIVED)
FIND_SIM  := scripts/find_sim.sh

.PHONY: generate build-macos build-ios build-ios-iphone build-ios-ipad build-all verify-idempotent verify clean

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

## 生成幂等性：连跑两次 xcodegen，逐文件（内容 + 文件名集合）比对，
## 任何漂移（diff 非空）即非零退出。空的 SwiftPM 副作用目录不算漂移。
verify-idempotent: $(PROJECT)
	@snap1=$$(mktemp -d); snap2=$$(mktemp -d); \
	rm -rf Mewmo.xcodeproj; \
	xcodegen generate --quiet; \
	./scripts/snapshot_project.sh Mewmo.xcodeproj "$$snap1"; \
	rm -rf Mewmo.xcodeproj; \
	xcodegen generate --quiet; \
	./scripts/snapshot_project.sh Mewmo.xcodeproj "$$snap2"; \
	if diff -r "$$snap1" "$$snap2" >/tmp/mewmo_gen_drift.diff 2>&1; then \
		echo "✅ generate idempotent: consecutive outputs identical"; \
	else \
		echo "❌ generate DRIFT detected:"; cat /tmp/mewmo_gen_drift.diff; \
		rm -rf "$$snap1" "$$snap2"; exit 1; \
	fi; \
	rm -rf "$$snap1" "$$snap2"

## 完整验收：生成幂等校验 + 三 destination 全绿
verify: verify-idempotent build-all
	@echo "✅ verify: generate idempotent + 3 destinations all passed"

clean:
	@rm -rf $(DERIVED)
