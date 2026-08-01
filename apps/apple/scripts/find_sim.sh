#!/usr/bin/env bash
# 在已安装的模拟器中挑选一个给定 family（iPhone/iPad）的 device 名字。
# 用法: find_sim.sh <iphone|ipad>
# 输出: 匹配的 device identifier 或 device name（供 xcodebuild -destination 使用）。
set -euo pipefail

family_group="${1:-iphone}"

case "$family_group" in
  iphone) pattern='iPhone' ;;
  ipad)   pattern='iPad' ;;
  *)      echo "unknown family: $family_group (expect iphone|ipad)" >&2; exit 2 ;;
esac

# 优先可用(Booted 优先)设备；退回到任何存在的设备。输出 identifier。
pick() {
  xcrun simctl list devices available | sed -n '/-- /,/^$/p' | \
    grep -i "$pattern" | head -n 1 | sed -E 's/^[[:space:]]*([^(]+) \(([^)]+)\).*/\2/'
}

id=""
# 尝试 Booted
if my_id="$(xcrun simctl list devices booted | grep -i "$pattern" | head -n1 | sed -E 's/.*\(([^)]+)\).*/\1/')" && [ -n "$my_id" ]; then
  id="$my_id"
else
  id="$(pick)"
fi

if [ -z "$id" ]; then
  echo "no $family_group simulator installed. Run: xcrun simctl create ... " >&2
  exit 1
fi

echo "$id"
