"use client";

import { type RefObject } from "react";
import { PrototypeIcon } from "./PrototypeIcon";

interface ReaderBackToTopButtonProps {
  scrollRef: RefObject<HTMLElement | null>;
  visible: boolean;
}

export function ReaderBackToTopButton({
  scrollRef,
  visible,
}: ReaderBackToTopButtonProps) {
  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      className={`mewmo-reader-to-top ${visible ? "mewmo-reader-to-top--visible" : ""}`}
      onClick={scrollToTop}
      aria-label="回到顶部"
      title="回到顶部"
    >
      <PrototypeIcon name="arrow-up" size={20} />
    </button>
  );
}
