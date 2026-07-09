# 026 - 远端状态不能从本地仓库反推

## 症状

用户说 GitHub 已上传、release 已创建、CI 已触发、npm 包已发布或部署已上线时，如果从本地 `git remote`、本地 `git log`、本地文件树反推远端状态，会得出和用户实际看到的页面相反的结论。

## 根因

本地只是当前机器的开发快照，远端才是用户看到的真相。两者可能因为临时 app-only 仓库、GitHub Web 上传、CI 自动 commit、worktree、删除 remote 等原因完全解耦。本地没有 remote、本地 tag 不存在、本地 HEAD 没有某个 commit，都不能证明远端不存在对应状态。

## 修法

第一步永远拿远端事实。GitHub 用 `gh repo view <owner>/<repo>`、`gh api repos/<owner>/<repo>/contents/`、`gh release list --repo <owner>/<repo>`、`gh release view <tag> --repo <owner>/<repo> --json isDraft,url,assets`、`gh run view <run-id> --repo <owner>/<repo>`。npm、PyPI、Docker、Vercel、Cloudflare 同理，用对应 registry 或官方 API。

## 关联文件

曾作为项目规则保存在 `.claude/rules/remote-state-verification.md`，适用范围是 `.github/workflows/*.yml`、`apps/**/package.json`、`packages/**/package.json`、`package.json`、`README.md`。

## 踩坑记录 / 可复用教训

如果远端事实和本地状态冲突，先相信远端，再解释本地为什么不同。当第一次基础事实判断被用户纠正，立刻换验证方法重做，不要在旧判断上补洞。一次错事实会衍生不存在的隐私泄露、重复发布、CI 失败等连锁错判。
