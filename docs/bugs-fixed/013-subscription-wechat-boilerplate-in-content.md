# 013 - 订阅正文包含微信赞赏弹窗等脏信息

## 症状

微信公众号文章在 EntryReader 中显示时，正文尾部出现"关闭、更多、微信扫一扫赞赏作者、喜欢作者、其它金额、¥、返回、确定"等赞赏弹窗 UI 文本，以及底部地理位置/时间元数据。

## 根因

WeRSS 抓取微信文章页面时，把整个页面 DOM 放入 `content:encoded` XML 字段，包括：
- 赞赏弹窗区域（所有 class 含 `reward` 的 div）
- 底部元数据栏（class 含 `rich_media_meta_list`）
- `display:none` 隐藏元素

之前的方案用 `el.html()` 做字符串 replace 清洗，但 scraper 会在序列化时规范化属性顺序/引号，导致生成的 HTML 与原始字符串对不上，replace 静默失败。

## 修法

改用 ego-tree NodeId 方案：
1. scraper 解析 DOM → CSS selector 匹配 boilerplate 节点 → 收集 NodeId 到 HashSet
2. 从 document root 递归遍历 tree，跳过 HashSet 中的节点及其子树
3. 只序列化保留的节点，输出干净 HTML

关键文件：`app/src-tauri/src/subscription/adapter.rs` (`strip_wechat_boilerplate` + `serialize_tree`)

新增依赖：`ego-tree = "0.10"`（与 scraper 0.22 内部使用同版本）

## 关联文件

- `app/src-tauri/src/subscription/adapter.rs`
- `app/src-tauri/Cargo.toml`

## 踩坑

- scraper 的 `el.html()` 不等于原始 HTML 片段——它重新序列化 DOM，属性顺序/引号/空格都可能变化，不能用于 string replace
- scraper 0.22 不 re-export ego_tree，需要单独加依赖才能使用 `NodeId` 类型
- `display:none` 的 CSS attribute selector 在 scraper 中对 inline style 的匹配不够稳定（空格敏感），主要依赖 class selector 做清洗
