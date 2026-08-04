# 实现 Mac 笔记功能

## Goal

在 macOS App 交付可离线重启的笔记工作区：从本地 SwiftData 即时读取，支持列表、搜索、筛选、新建、打开、编辑和软删除，并通过既有 outbox / SyncEngine 双向同步。

## Requirements

- 仅修改 `apps/apple/` 与本 task artifacts；不得修改 Web API、Prisma schema、`packages/shared` 或 iOS/iPad 的完整 UI。
- 复用 `MacShell` 的三栏、主题、tab 与键盘模式，复用 `LocalStore`、`SyncEngine`、`MewmoImagePipeline`，不得建立另一套编辑器或同步 abstraction（抽象层）。
- 笔记写入必须先本地持久化再入 durable outbox（持久化队列）；重启后内容、软删除和未推送 mutation 仍存在，网络同步不得阻塞首屏读取。
- 同步使用现有 canonical v1 note mutation；pull/push 冲突必须以可见状态呈现，并保留本地未合并内容，不能静默丢弃。
- Markdown 是跨端存储格式。Mac 编辑器保存 Markdown 原文；未知 rich-text（富文本）节点不做本地转换或损坏，图片继续按原始七牛 URL 写入 Markdown 并由 ZOO-92 pipeline 加载。
- 列表按 Web 语义支持标题/正文搜索、All/Pinned 筛选、置顶排序、选择、新建、删除后选中下一项、loading/empty/error/offline-stale 与保存/同步状态。
- 支持 `Cmd-N` 新建笔记、`Cmd-F` 聚焦搜索、`Cmd-S` 立即保存、Delete 删除确认；深浅主题使用 ZOO-90 中性 token，并在 compact / regular / wide 主窗口尺寸可用。

## Acceptance Criteria

- [ ] 从 SwiftData 读取笔记不等待网络，创建、编辑、软删除立即可见且离线重启仍保持。
- [ ] 每个本地改变写入可验证的 FIFO note mutation；现有 `SyncEngine` 能推送并拉取，冲突为用户可见且内容未静默覆盖。
- [ ] 列表、搜索、All/Pinned 筛选、创建、打开、编辑、删除、空态和错误态可用，键盘操作可达。
- [ ] Markdown 文本和七牛图片 URL 保持 Web 兼容边界；Mac 复用既有图片 pipeline，不重写 URL 或上传机制。
- [ ] focused XCTest 覆盖本地 mutation、持久化重开、冲突可见状态和筛选/搜索；`make -C apps/apple verify`、`git diff --check` 通过。
- [ ] 深色与浅色及 compact / regular / wide Mac 窗口完成视觉验收。

## Out Of Scope

- AI、协作编辑、导出、服务端 API、Prisma schema、`packages/shared`。
- iOS/iPad 完整业务 UI、图片上传、同步协议变更或自定义冲突合并算法。
