# Mewmo Apple 工程本地构建入口。
# 用法见 README.md。所有 target 默认无签名（CODE_SIGNING_ALLOWED=NO），可在零证书机器复现。

SHELL := /usr/bin/env bash
PROJECT   := Mewmo.xcodeproj
SCHEME_MAC := Mewmo-Mac
SCHEME_IOS := Mewmo-iOS
DERIVED   := DerivedData
XCODEBUILD := xcodebuild -project $(PROJECT) -derivedDataPath $(DERIVED)
FIND_SIM  := scripts/find_sim.sh

.PHONY: generate build-macos build-ios build-ios-iphone build-ios-ipad build-all verify clean

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

## 生成幂等 + 三 destination 全绿
verify: generate build-all
	@echo "✅ verify: generate idempotent + 3 destinations all passed"

clean:
	@rm -rf $(DERIVED)
