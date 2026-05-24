#!/usr/bin/env bash
# 多 worktree 独立 dev：按 name 分配 vite 端口 + tauri identifier + productName，
# 让多份 app 可以同时运行、各自有独立数据库。
#
# 用法：
#   ./scripts/dev.sh             # 默认 main，端口 5173
#   ./scripts/dev.sh notes       # 端口 5174，identifier com.vibecoding.app.notes
#   ./scripts/dev.sh search      # 端口 5175
#   ./scripts/dev.sh xyz         # 未列出的名字 → 5180 + com.vibecoding.app.xyz
#
# 数据库位置（macOS）：~/Library/Application Support/<identifier>/vibe.db
# 想把 main 的数据搬到其他实例：
#   cp -R ~/Library/Application\ Support/com.vibecoding.app/ \
#         ~/Library/Application\ Support/com.vibecoding.app.notes/

set -euo pipefail

NAME="${1:-main}"

case "$NAME" in
  main)   PORT=5173; ID="com.vibecoding.app"        ;;
  notes)  PORT=5174; ID="com.vibecoding.app.notes"  ;;
  search) PORT=5175; ID="com.vibecoding.app.search" ;;
  clip)   PORT=5176; ID="com.vibecoding.app.clip"   ;;
  *)      PORT=5180; ID="com.vibecoding.app.$NAME"  ;;
esac

# 找 app 目录：
# 1) 优先用调用者 cwd 下的 app/——支持从 worktree 调用主目录的脚本（worktree 没有自己的 scripts/）
# 2) 回退到脚本同级的 ../app
CALLER_APP="$(pwd)/app"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_APP="$(cd "$SCRIPT_DIR/../app" 2>/dev/null && pwd || true)"

if [ -f "$CALLER_APP/package.json" ]; then
  APP_DIR="$CALLER_APP"
elif [ -f "$SCRIPT_APP/package.json" ]; then
  APP_DIR="$SCRIPT_APP"
else
  echo "错误：找不到 app 目录" >&2
  echo "  尝试过：$CALLER_APP" >&2
  echo "         $SCRIPT_APP" >&2
  echo "提示：请从仓库根目录或 worktree 根目录调用此脚本" >&2
  exit 1
fi

# DB 共享：让非 main 实例的 AppData 目录 symlink 到 main 的，所有实例共看一份 vibe.db
# main 自身的目录就是源头，不动它
MAIN_DATA="$HOME/Library/Application Support/com.vibecoding.app"
INSTANCE_DATA="$HOME/Library/Application Support/$ID"
DB_SHARED_NOTE=""

if [ "$NAME" != "main" ]; then
  mkdir -p "$MAIN_DATA"
  if [ -L "$INSTANCE_DATA" ]; then
    LINK_TARGET="$(readlink "$INSTANCE_DATA")"
    if [ "$LINK_TARGET" != "$MAIN_DATA" ]; then
      echo "⚠️  $INSTANCE_DATA 是 symlink 但指向错误位置（$LINK_TARGET），重建中..."
      rm "$INSTANCE_DATA"
      ln -s "$MAIN_DATA" "$INSTANCE_DATA"
    fi
    DB_SHARED_NOTE="共享 main"
  elif [ -d "$INSTANCE_DATA" ]; then
    # 已存在真目录：可能是之前隔离模式跑出来的
    DB_SIZE=0
    if [ -f "$INSTANCE_DATA/vibe.db" ]; then
      DB_SIZE=$(stat -f%z "$INSTANCE_DATA/vibe.db" 2>/dev/null || echo 0)
    fi
    # 空 DB（migrations 建完表的初始大小）大约 24-40KB；超过 65536 认为有用户数据
    if [ "$DB_SIZE" -gt 65536 ]; then
      echo "⚠️  $INSTANCE_DATA 已有用户数据（vibe.db ${DB_SIZE} 字节），不会自动覆盖"
      echo "    要切共享模式：先备份 → rm -rf '$INSTANCE_DATA' → 重跑此脚本"
      exit 1
    fi
    # 空 / 几乎空 → 安全删除真目录并替换为 symlink
    rm -rf "$INSTANCE_DATA"
    ln -s "$MAIN_DATA" "$INSTANCE_DATA"
    DB_SHARED_NOTE="✓ 已切换到共享 main DB（删除了空的独立目录）"
  else
    ln -s "$MAIN_DATA" "$INSTANCE_DATA"
    DB_SHARED_NOTE="✓ 已创建 symlink → 共享 main DB"
  fi
fi

echo "▶ 启动 [$NAME]"
echo "  app: $APP_DIR"
echo "  vite 端口: $PORT"
echo "  identifier: ${ID}"
if [ -n "$DB_SHARED_NOTE" ]; then
  echo "  数据库: $DB_SHARED_NOTE"
else
  echo "  数据库: $MAIN_DATA"
fi
echo "  productName: vibe-${NAME}"
echo ""

cd "$APP_DIR"

# tauri dev --config 接受 JSON 字符串临时覆盖 tauri.conf.json，不动磁盘文件
VITE_PORT=$PORT PATH="$HOME/.cargo/bin:$PATH" pnpm tauri dev --config "{
  \"identifier\": \"$ID\",
  \"productName\": \"vibe-$NAME\",
  \"build\": {\"devUrl\": \"http://localhost:$PORT\"}
}"
