# 双态 UI（展开/折叠 / 编辑/预览 / 移动/桌面）必须结构同构

## 案例

vibe-coding sidebar 折叠按钮，用户原始诉求一句话："折叠后 icon 在 sidebar 居中"。后续又说"水平位置不要变化"。我前后改了 6+ 轮：

1. text-left → centered（错：用户说还是偏左）
2. w-full + py-2.5（错）
3. w-10 h-10 inline style（错）
4. 40×40 icon-cell + grid place-items-center（错）
5. flex flex-col items-center 显式居中（错）
6. w-8 h-8 + 容器 pl-2（错：用户终于点破"全挤了"）
7. **正解：折叠态容器/button 尺寸全部沿用展开态，只 conditional render 隐藏 label/count**

每一轮我都在用"折叠态特殊几何参数"思考——h-8 vs h-10、pl-2 vs px-3、mb-1 vs mb-2。每改一处局部对齐了，但整体 sidebar 像被压扁。

## 反思：单点几何 vs 结构同构

用户说"水平位置不要变化"时，模型本能解读："让某个 icon 的 x 坐标在两态相等" → 调单点 padding。这是错的。

用户的实际心智模型是：sidebar 是**一个容器**，折叠操作是**让内容变窄**（隐藏文字），而不是**把容器和按钮全部换一套小一号的尺寸**。模型如果把"折叠"当成两套并列设计，就会自然地为折叠态选一套"看起来合适的小尺寸"——结果在用户眼里整个 sidebar 像被压扁了，每个 icon 的 x、y 都漂了。

## 抽象规律

凡是有"两态切换"的 UI（折叠/展开、编辑/预览、深/浅、移动/桌面），**默认假设是结构同构**：两态共用一套容器布局、padding、间距、按钮高度，差异只在 button 内部内容（show/hide 文字、换 icon 等）。**只在结构同构的方案被验证不可行后，才考虑两套独立尺寸**。

实操判定：写两态 UI 时先问自己——"如果我把折叠态的所有容器/button 尺寸 className 换成和展开态一模一样，只在 button 内 conditional render 文字，会出什么问题吗？" 一般不会。如果会（比如展开态 padding 太大折叠态装不下），再分两套——而且要明确告诉用户"两套尺寸"是必要妥协。

## 触发场景

- 写 sidebar collapse/expand
- 写 dialog mobile/desktop 双布局
- 写 toolbar compact/full mode
- 任何"同一组件在两种状态下渲染"

## 与"几何对齐"思路的对照

几何对齐思路（错）：在每种状态独立计算 icon x/y、调 padding、调 size 让两态视觉重合。
结构同构思路（对）：让两态用**同一套容器和 button 尺寸**，自然就重合，不需要算。
