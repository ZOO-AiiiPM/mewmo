// easeOutQuart（k=4）：开头较快但不像 expo 那么暴力，末段依然有长拖尾减速。
// expo 的指数衰减在 t=0 处斜率最大 → 开头一瞬间满速冲出，体感太"猛"；
// quart 的多项式衰减开头斜率温和约 1/3，更接近 macOS 系统滚动的"轻推一下"。
export function smoothScrollToTop(el: HTMLElement | null, duration = 750) {
  if (!el) return;
  const startY = el.scrollTop;
  if (startY < 4) return;
  const startT = performance.now();
  const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
  const tick = (now: number) => {
    const elapsed = now - startT;
    const t = Math.min(elapsed / duration, 1);
    el.scrollTop = startY * (1 - easeOutQuart(t));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
