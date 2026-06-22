import { useEffect, useMemo, useRef } from 'react';
import { sanitizeHtml } from '../lib/sanitizeHtml';

function isNeutralColor(c: string): boolean {
  if (!c) return false;
  const m = c.match(/rgba?\((\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (m) {
    const channels = [+m[1], +m[2], +m[3]];
    return Math.max(...channels) - Math.min(...channels) < 30;
  }
  if (!c.startsWith('#')) return false;
  const hex = c.slice(1);
  const channels = hex.length === 3
    ? [hex[0] + hex[0], hex[1] + hex[1], hex[2] + hex[2]].map(v => parseInt(v, 16))
    : hex.length === 6
      ? [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map(v => parseInt(v, 16))
      : null;
  if (!channels) return false;
  const [r, g, b] = channels;
  return Math.max(r, g, b) - Math.min(r, g, b) < 30;
}

type Props = {
  html: string;
  contentKey: string | number;
};

export function ContentRenderer({ html, contentKey }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);

  const contentHtml = useMemo(
    () => (html ? sanitizeHtml(html) : ''),
    [html],
  );

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    root.innerHTML = contentHtml;
  }, [contentHtml]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const apply = () => {
      const isDark = document.documentElement.classList.contains('dark');
      root.querySelectorAll<HTMLElement>('[style]').forEach(el => {
        if (el.dataset.origColor === undefined) {
          el.dataset.origColor = el.style.color || '';
        }
        const oc = el.dataset.origColor || '';
        if (!isDark) { el.style.color = oc; return; }
        el.style.color = isNeutralColor(oc) ? '' : oc;
      });
    };
    apply();
    const themeObs = new MutationObserver(apply);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const contentObs = new MutationObserver(apply);
    contentObs.observe(root, { childList: true, subtree: true });
    return () => {
      themeObs.disconnect();
      contentObs.disconnect();
    };
  }, [contentKey]);

  if (!html) {
    return <div className="text-stone-400 dark:text-stone-500 text-sm italic">暂无正文内容</div>;
  }

  return <div ref={contentRef} className="clip-prose" />;
}
