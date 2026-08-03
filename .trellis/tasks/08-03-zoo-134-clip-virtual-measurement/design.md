# Technical Design

先追踪剪藏列表从数据数组到 `useVirtualizer`、virtual item key、React key 和 `measureElement` 的完整 identity 链。若虚拟器缺少稳定 `getItemKey`，直接以剪藏 ID 修复；若动态图片加载后高度未回测，则在既有测量入口补最小失效机制。

测试以不同高度条目头插为核心，断言稳定 key 与测量行为；不引入新的虚拟列表封装。
