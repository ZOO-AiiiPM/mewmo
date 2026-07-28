# notes-home.html 原型并行编辑事故（2026-06-30）

## 背景

在 `worktree/2.0` 上迭代 `docs/prototypes/notes-home.html`，这一轮要做的改动挺多：订阅快速跳转动画、文章/媒体内容区分、三点菜单、剪藏动画等多处修复。问题出在——整个迭代期间，有另一个 agent / 编辑器**并行编辑同一个文件**，于是工具层面全程在弹「file modified since read」（文件自上次读取后已被修改）。两个 session 共用同一份 working tree、同一个物理文件，互相覆盖，最后引爆了两起事故。

## 事故一：`git checkout --` 把别人未提交的活儿抹掉了

另一个 session 执行了 `git checkout -- docs/prototypes/notes-home.html`。它的心智模型是「这只动 working tree、又没 commit，所以很安全」——这恰恰是最危险的误判。`git checkout -- <path>` 的语义是**把 working tree 里那个文件强制还原成 HEAD 的版本，丢弃一切未提交改动**，是个不折不扣的破坏性操作。

后果很重：

- session 一开始就已经存在约 **212 行未提交的原型工作**（当时文件 2641 行，HEAD 只有 2429 行），再叠加本 session 这一轮做的多个修复，全部从磁盘上消失。
- 这些改动从没 `git add` / `stash` / `commit` 过，所以 **git object 数据库里压根没有任何副本**——不是 dangling blob 能捞回来的情况，是彻底没了。

最后是靠该 session 自己之前手动建的 `notes-home-warm.html` 备份 `cp` 回来才恢复的。换句话说，救命的不是 git，是一份土法备份。

## 事故二：智能引号让整段 `<script>` 解析失败

在恢复 / 并行编辑的过程中，第 **1575–1591 行**那段「分组折叠动画」的 JS，引号被写成了中文智能引号 `“ ”` 而不是直引号 `"`。

JS 解析器读到智能引号直接报 `Uncaught SyntaxError: Invalid or unexpected token`，**整个 `<script>` 块解析失败**。表现是原型所有交互全部失效——事件监听器没绑上、`currentNavView` 这种初始化变量也没赋值，点哪儿都没反应。

定位靠的是 chrome console 看到那条 SyntaxError，然后把那 17 行里的智能引号改回直引号才恢复。报错信息本身**不指向出错的具体行**，所以光看 console 第一眼只知道「script 挂了」，得再全文件搜引号才能锁定。

## 教训（可复用）

**1. 多 agent 共享同一 working tree / 同一文件 = 高危，要当成红线。**
`git checkout -- ` / `git restore` 会无声抹掉别人未提交的劳动。关键认知：**未 `git add` 的改动在 git object 数据库里没有任何副本，覆盖即永久丢失**——「没 commit 所以安全」是彻底错误的直觉，没 commit 恰恰意味着没有任何回退点。看到文件 dirty 时，先假设那些改动是别人（或并行 session）的劳动，先 `git diff > .recovery.patch` + `git stash --include-untracked` 留底，再动任何会重写 working tree 的命令。

**2. 富文本 / 某些编辑器会把代码里的引号自动转成智能引号 `“”`，这在 JS 里是致命语法错误。**
而且报错信息不指向具体行。定位手法：`grep -P '[“”]' <file>`（或连带 `‘’` 单引号变体一起搜）扫全文件，一抓一个准。写 / 粘贴含代码的内容时尤其要警惕经过了富文本环节。

**3. 调「点击无反应 / 交互全失效」时，第一步永远先看 console 有没有 `SyntaxError`。**
整段 script 解析失败的典型特征就是：连初始化变量都没被赋值、所有监听器都没绑上——一个局部 bug 不会让全场全死，全死基本等于整块脚本没跑起来。先排除「整段没解析」，再去查具体逻辑，能省掉大量在错误方向上的排查。
