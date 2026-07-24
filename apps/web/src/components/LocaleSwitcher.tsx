"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "../i18n/actions";

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("marketing");
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
      className={className}
      aria-label={`Switch to ${nextLocale === "zh" ? "中文" : "English"}`}
    >
      {t("localeSwitcher")}
    </button>
  );
}
