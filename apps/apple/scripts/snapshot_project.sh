#!/usr/bin/env bash
# 将 <src> 目录下所有常规文件与符号链接复制到 <dst>（跳过目录结构中的空目录）。
# 用途：XcodeGen 连续生成幂等性校验 —— 将两次生成的工程投影成「文件 + 内容」快照，
# 供 `diff -r` 逐文件比对。SwiftPM 生成的空目录不参与比对，不视为漂移。
set -euo pipefail

src="${1:?usage: snapshot_project.sh <src> <dst>}"
dst="${2:?usage: snapshot_project.sh <src> <dst>}"

mkdir -p "$dst"

while IFS= read -r -d '' f; do
  rel="${f#"$src"/}"
  mkdir -p "$(dirname "$dst/$rel")"
  if [ -L "$f" ]; then
    cp -P "$f" "$dst/$rel"
  else
    cp "$f" "$dst/$rel"
  fi
done < <(find "$src" -type f -print0)
