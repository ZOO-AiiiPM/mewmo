# Implementation Plan

1. 定位剪藏列表虚拟器、卡片高度来源和新增剪藏头插路径。
2. 添加能复现 index 缓存错位的 focused regression test。
3. 在共享根因处加入稳定 item key，并按需要修复动态测量失效。
4. 运行 focused test、Web lint、theme、unit 与 build；浏览器验证混合高度列表。
