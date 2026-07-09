# 024 - 列表接口拉全文导致长期信息库性能失控

## 症状

notes / clips / feed entries / knowledge items 会长期增长。如果列表接口把正文全文、完整 HTML 或大段 AI 结果一起返回，前端列表、搜索结果、侧栏和 worker 调用都会承担不必要的网络、序列化和渲染成本。

## 根因

列表和详情的性能模型混在一起：列表只需要标题、元数据、封面、状态和短 preview，但为了省一次详情请求，很容易把 `content_md` / `contentHtml` / 大段 AI 结果塞进列表响应。这样会让普通浏览路径随资料库增长而退化。

## 修法

列表 API 只返回摘要和展示元数据；详情页或阅读器选中后再按 id 拉完整正文。前端不能把 preview 当正文渲染。更新正文后要同步本地详情状态或触发详情重取，避免显示旧内容或反复请求。

## 关联文件

曾作为项目规则保存在 `.claude/rules/list-summary-loading.md`，适用范围是 `apps/web/src/app/api/**/*.ts`、`apps/web/src/app/(app)/**/*.tsx`、`apps/web/src/lib/**/*.ts`、`packages/db/src/repositories/**/*.ts`、`packages/shared/src/validators/**/*.ts`。

## 踩坑记录 / 可复用教训

默认把列表、搜索结果、AI 工具和侧栏数据源设计成摘要流。确实需要批量全文的功能，例如导出或全库分析，必须做成明确的后台任务或分页/流式流程，不能复用列表接口偷懒。
