import { useEffect, useRef, useState } from 'react';

type Props = {
  scrollRef: React.RefObject<HTMLElement | null>;
  threshold?: number;
};

export function ScrollToTopButton({ scrollRef, threshold = 200 }: Props) {
  const [visible, setVisible] = useState(false);
  const rafRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setVisible(el.scrollTop > threshold);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [scrollRef, threshold]);

  return (
    <button
      onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
      title="回到顶部"
      className={`absolute bottom-6 right-6 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-white dark:bg-stone-800 shadow-md border border-black/[0.08] dark:border-white/[0.1] text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-all duration-200 ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-75 pointer-events-none'
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 3h14" />
        <path d="m18 13-6-6-6 6" />
        <path d="M12 7v14" />
      </svg>
    </button>
  );
}
