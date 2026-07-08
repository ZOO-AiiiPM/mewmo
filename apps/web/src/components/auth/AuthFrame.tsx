import Link from "next/link";
import type { ReactNode } from "react";

interface AuthFrameProps {
  title: string;
  eyebrow: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthFrame({ title, eyebrow, children, footer }: AuthFrameProps) {
  return (
    <main className="mewmo-auth-page">
      <section className="mewmo-auth-visual" aria-label="Mewmo preview">
        <Link href="/" className="mewmo-auth-brand" aria-label="mewmo home">
          <span className="mewmo-auth-brand-mark">m</span>
          <span>mewmo</span>
        </Link>
        <div className="mewmo-auth-copy">
          <p className="mewmo-auth-kicker">Private knowledge workspace</p>
          <h1>Keep the useful parts of the internet close.</h1>
          <p>
            Collect notes, clipped pages, and feeds into one quiet workspace,
            then let AI resurface the context when you need it.
          </p>
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
