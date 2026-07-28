"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthFrame } from "../../../components/auth/AuthFrame";
import { PasswordField } from "../../../components/auth/PasswordField";

const PASSWORD_MIN_LENGTH = 8;

function normalizeAuthCallbackUrl(value: string | null) {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("auth.register");
  const callbackUrl = searchParams.get("callbackUrl");
  const loginHref = callbackUrl
    ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/login";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSendCode() {
    setError("");
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const email = (fd.get("email") as string) || "";
    const password = (fd.get("password") as string) || "";

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError(t("invalidEmail"));
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t("passwordTooShort", { min: PASSWORD_MIN_LENGTH }));
      return;
    }

    setSendingCode(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.status === 429) {
        setError(t("codeTooFrequent"));
        return;
      }
      if (res.status === 409) {
        setError(t("emailExists"));
        return;
      }
      if (!res.ok) {
        setError(t("sendFailed"));
        return;
      }

      setSent(true);
      setCooldown(60);
    } catch {
      setError(t("networkError"));
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t("passwordTooShort", { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }
    if (code.length !== 6) {
      setError(t("codeRequired"));
      return;
    }

    setLoading(true);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, code }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || t("failed"));
      setLoading(false);
      return;
    }

    const data = (await res.json()) as { callbackUrl?: string };
    const nextCallbackUrl = normalizeAuthCallbackUrl(data.callbackUrl ?? null) || "/notes";
    router.push(`/login?callbackUrl=${encodeURIComponent(nextCallbackUrl)}`);
  }

  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: normalizeAuthCallbackUrl(callbackUrl) || "/notes" });
  }

  return (
    <AuthFrame
      eyebrow={t("eyebrow")}
      title={t("title")}
      footer={
        <p>
          {t("hasAccount")}{" "}
          <Link href={loginHref}>
            {t("logIn")}
          </Link>
        </p>
      }
    >
      <form ref={formRef} onSubmit={handleSubmit} className="mewmo-auth-form">
        <div className="mewmo-auth-field">
          <label>{t("name")}</label>
          <input name="name" type="text" placeholder={t("namePlaceholder")} />
        </div>

        <div className="mewmo-auth-field">
          <label>{t("email")}</label>
          <input name="email" type="email" required placeholder="you@example.com" />
        </div>

        <div className="mewmo-auth-field">
          <label>{t("password")}</label>
          <PasswordField
            name="password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            placeholder={t("passwordMin", { min: PASSWORD_MIN_LENGTH })}
          />
        </div>

        <div className="mewmo-auth-field">
          <label>{t("confirmPassword")}</label>
          <PasswordField
            name="confirmPassword"
            required
            minLength={PASSWORD_MIN_LENGTH}
            placeholder={t("confirmPasswordPlaceholder")}
          />
        </div>

        <div className="mewmo-auth-field">
          <label>{t("code")}</label>
          <div className="mewmo-auth-code-row">
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder={t("codePlaceholder")}
              required
            />
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sendingCode || cooldown > 0}
              className="mewmo-auth-code-btn"
            >
              {cooldown > 0
                ? t("cooldown", { seconds: cooldown })
                : sendingCode
                  ? t("sending")
                  : sent
                    ? t("resend")
                    : t("sendCode")}
            </button>
          </div>
        </div>

        {error && <p className="mewmo-auth-error">{error}</p>}

        <button type="submit" disabled={loading} className="mewmo-auth-primary">
          {loading ? t("submitting") : t("submit")}
        </button>
      </form>

      <div className="mewmo-auth-divider">
        <span>{t("or")}</span>
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading}
        className="mewmo-auth-secondary"
      >
        <span className="mewmo-auth-google-mark">G</span>
        {googleLoading ? t("googleLoading") : t("googleButton")}
      </button>
    </AuthFrame>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
