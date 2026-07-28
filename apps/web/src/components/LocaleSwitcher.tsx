"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "../i18n/actions";

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const nextLocale = locale === "zh" ? "en" : "zh";

  function handleSwitch() {
    startTransition(async () => {
      await setLocaleAction(nextLocale);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleSwitch}
      disabled={pending}
      className={`mewmo-locale-switcher ${className ?? ""}`}
      aria-label={`Switch to ${nextLocale === "zh" ? "中文" : "English"}`}
      title={locale === "zh" ? "切换到 English" : "Switch to 中文"}
    >
      <span className="mewmo-locale-switcher__icon" aria-hidden="true">
        <span className="mewmo-locale-switcher__zh">文</span>
        <span className="mewmo-locale-switcher__divider">/</span>
        <span className="mewmo-locale-switcher__en">A</span>
      </span>
      <span className="mewmo-locale-switcher__indicator" data-active={locale === "zh" ? "zh" : "en"} />
    </button>
  );
}
