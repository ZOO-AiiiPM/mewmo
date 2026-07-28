import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

interface AuthFrameProps {
  title: string;
  eyebrow: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthFrame({ title, eyebrow, children, footer }: AuthFrameProps) {
  const t = useTranslations("auth.frame");

  return (
    <main className="mewmo-auth-page">
      <section className="mewmo-auth-visual" aria-label={t("previewAriaLabel")}>
        <Link href="/" className="mewmo-auth-brand" aria-label={t("homeAriaLabel")}>
          <span className="mewmo-auth-brand-mark">m</span>
          <span>mewmo</span>
        </Link>
        <div className="mewmo-auth-copy">
          <p className="mewmo-auth-kicker">{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p>{t("description")}</p>
        </div>
        <div className="mewmo-auth-preview" aria-hidden="true">
          <img src="/mewmo-workspace-preview.png" alt="" />
        </div>
      </section>

      <section className="mewmo-auth-form-region" aria-labelledby="auth-title">
        <div className="mewmo-auth-mobile-brand" aria-hidden="true">
          <span className="mewmo-auth-brand-mark">m</span>
          <span>mewmo</span>
        </div>
        <div className="mewmo-auth-panel">
          <div className="mewmo-auth-panel-header">
            <p>{eyebrow}</p>
            <h2 id="auth-title">{title}</h2>
          </div>
          {children}
        </div>
        <div className="mewmo-auth-footer">{footer}</div>
      </section>
    </main>
  );
}
