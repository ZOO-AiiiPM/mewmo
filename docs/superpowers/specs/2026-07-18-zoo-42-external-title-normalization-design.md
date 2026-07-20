# ZOO-42 外部标题规范化设计

## 问题与根因

外部标题目前经过三套不同清洗逻辑。订阅发现使用 `entities.decodeHTMLStrict`，RSS/Atom 写入链路在 `packages/content/src/feed.ts` 手写替换少量实体，网页文章提取在 `packages/content/src/article.ts` 又维护另一组少量替换。后两者无法完整处理十进制实体、十六进制实体和再次转义的嵌套实体，因此 `&#8211;`、`&#x2013;` 或 `&amp;#8211;` 可能作为普通文本进入数据库。

问题发生在外部内容进入产品数据之前，不是字体、CSS 或 React 渲染问题。只在页面显示时 decode 会让数据库、今天页、知识库、同步和 AI 输入继续持有脏标题，因此不采用显示层补丁。

## 统一边界

在 `@mewmo/content` 新增 `normalizeExternalTitle(value: string): string`，作为 RSS/Atom、网页 metadata 和订阅发现标题的唯一规范化入口。它执行以下有限操作：

- 移除 CDATA 包装和标题内部 HTML 标签。
- 使用标准 HTML entity 解码器，最多迭代三次，使常见的双重转义恢复为字符。
- 将不可见不换行空格折叠为普通空格，并合并多余空白。
- 对已经正确的中文、英文、emoji、普通连字符和真实 `&` 保持幂等。

Feed 正文、摘要、URL 和用户输入不复用标题函数。数据库 Repository 也不复制解码逻辑；外部内容应在 `@mewmo/content` 边界完成规范化。

## 接入点

- `packages/content/src/feed.ts`：RSS 与 Atom 条目 title。
- `packages/content/src/article.ts`：`og:title`、`twitter:title` 和 `<title>` 的最终候选。
- `apps/web/src/lib/feed-discovery.ts`：Feed 标题、HTML 页面标题、alternate link title 和搜索回退 title。

首次订阅和 Cron 都消费 `fetchFeedDocument()`；剪藏消费 `fetchArticleFromUrl()`。上述接入覆盖新 Feed、FeedEntry 与 Clip 标题，并让列表、正文、今天页、知识库和 AI Summary 自然读取同一份干净数据库值。

## 历史回填

新增 dry-run-first 命令，分页扫描 `Feed.title`、`FeedEntry.title` 和 `Clip.title`。仅当规范化结果与当前标题不同时才计为 matched；apply 模式使用 `id + 原 title` 条件更新并递增 `version`，避免覆盖并发修改，也让同步端看到变化。重复运行时 matched 和 updated 都应为 0。

2026-07-18 实施前只读复核的当前开发库规模为 Feed 51、FeedEntry 87、Clip 131。标准实体扫描为 0；宽扫描只发现一条含真实 `&` 的正常标题。Issue 描述中的 60/3/2 属于较早快照，不能声称当前仍有同等数量的脏数据。回填工具仍保留，因为其他环境或后续导入可能存在历史值。

## 验收

- `&#8211;`、`&#8221;`、`&#x2013;`、`&amp;#8211;` 和命名实体正确解码。
- 正常中文、emoji、普通连字符与真实 `&` 不被破坏，重复规范化结果不变。
- RSS、Atom、网页剪藏和订阅发现标题都调用共享入口。
- 回填 dry-run 不写数据库；apply 只更新发生变化的标题并递增 version；第二次运行更新数量为 0。
- 当前数据库执行 dry-run、apply、再次 dry-run，并如实记录实际匹配数。
