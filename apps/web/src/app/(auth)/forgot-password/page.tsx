"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AuthFrame } from "../../../components/auth/AuthFrame";
import { PasswordField } from "../../../components/auth/PasswordField";

const PASSWORD_MIN_LENGTH = 8;

type Step = "email" | "reset";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgotPassword");
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function sendCode(target: string): Promise<boolean> {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: target }),
    });

    if (res.status === 429) {
      setError(t("codeTooFrequent"));
      return false;
    }
    if (!res.ok) {
      setError(t("sendFailed"));
      return false;
    }
    return true;
  }

  async function handleRequestCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const value = ((new FormData(e.currentTarget).get("email") as string) || "").trim();
    try {
      const ok = await sendCode(value);
      if (!ok) {
        setLoading(false);
        return;
      }
      // 防枚举：无论邮箱是否注册都进入验证码步骤
      setEmail(value);
      setStep("reset");
      setCooldown(60);
    } catch {
      setError(t("networkError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || resending) return;
    setError("");
    setResending(true);
    try {
      const ok = await sendCode(email);
      if (ok) setCooldown(60);
    } catch {
      setError(t("networkError"));
    } finally {
      setResending(false);
    }
  }

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const formData = new FormData(e.currentTarget);
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (code.length !== 6) {
      setError(t("codeRequired"));
      return;
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(t("passwordTooShort", { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, newPassword, confirmPassword }),
      });

      if (!res.ok) {
        setError(t("resetFailed"));
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError(t("networkError"));
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthFrame
        eyebrow={t("eyebrow")}
        title={t("successTitle")}
        footer={
          <p>
            <Link href="/login">{t("backToLogin")}</Link>
          </p>
        }
      >
        <p className="mewmo-auth-info">{t("successMessage")}</p>
      </AuthFrame>
    );
  }

  if (step === "reset") {
    return (
      <AuthFrame
        eyebrow={t("eyebrow")}
        title={t("resetTitle")}
        footer={
          <p>
            <Link href="/login">{t("backToLogin")}</Link>
          </p>
        }
      >
        <p className="mewmo-auth-info">
          {t.rich("codeSent", { email: () => <strong>{email}</strong> })}
        </p>
        <form onSubmit={handleReset} className="mewmo-auth-form">
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
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="mewmo-auth-code-btn"
              >
                {cooldown > 0
                  ? t("cooldown", { seconds: cooldown })
                  : resending
                    ? t("sending")
                    : t("resend")}
              </button>
            </div>
          </div>

          <div className="mewmo-auth-field">
            <label>{t("newPassword")}</label>
            <PasswordField
              name="newPassword"
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

          {error && <p className="mewmo-auth-error">{error}</p>}

          <button type="submit" disabled={loading} className="mewmo-auth-primary">
            {loading ? t("resetting") : t("reset")}
          </button>
        </form>

        <div className="mewmo-auth-help">
          <button
            type="button"
            className="mewmo-auth-linklike"
            onClick={() => {
              setStep("email");
              setCode("");
              setError("");
            }}
          >
            {t("changeEmail")}
          </button>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      eyebrow={t("eyebrow")}
      title={t("requestTitle")}
      footer={
        <p>
          {t("rememberedPassword")} {" "}
          <Link href="/login">{t("backToLogin")}</Link>
        </p>
      }
    >
      <form onSubmit={handleRequestCode} className="mewmo-auth-form">
        <div className="mewmo-auth-field">
          <label>{t("email")}</label>
          <input name="email" type="email" required placeholder="you@example.com" />
        </div>

        {error && <p className="mewmo-auth-error">{error}</p>}

        <button type="submit" disabled={loading} className="mewmo-auth-primary">
          {loading ? t("sending") : t("sendCode")}
        </button>
      </form>
    </AuthFrame>
  );
}
