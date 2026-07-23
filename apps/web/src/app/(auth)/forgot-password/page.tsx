"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthFrame } from "../../../components/auth/AuthFrame";

const PASSWORD_MIN_LENGTH = 8;

type Step = "email" | "reset";

export default function ForgotPasswordPage() {
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
      setError("验证码发送过于频繁，请稍后再试");
      return false;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || "发送失败，请重试");
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
      setError("网络错误，请重试");
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
      setError("网络错误，请重试");
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
      setError("请输入 6 位邮箱验证码");
      return;
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`新密码至少 ${PASSWORD_MIN_LENGTH} 位`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
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
        const data = await res.json().catch(() => null);
        setError(data?.error || "重置失败，请重试");
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("网络错误，请重试");
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthFrame
        eyebrow="Password reset"
        title="Password updated"
        footer={
          <p>
            <Link href="/login">Back to login</Link>
          </p>
        }
      >
        <p className="mewmo-auth-info">密码已重置，请用新密码登录。</p>
      </AuthFrame>
    );
  }

  if (step === "reset") {
    return (
      <AuthFrame
        eyebrow="Password reset"
        title="Enter code and new password"
        footer={
          <p>
            <Link href="/login">Back to login</Link>
          </p>
        }
      >
        <p className="mewmo-auth-info">
          如果 <strong>{email}</strong> 已注册，验证码已发送。请查收邮件中的 6 位验证码。
        </p>
        <form onSubmit={handleReset} className="mewmo-auth-form">
          <div className="mewmo-auth-field">
            <label>验证码</label>
            <div className="mewmo-auth-code-row">
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="6 位邮箱验证码"
                required
              />
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || cooldown > 0}
                className="mewmo-auth-code-btn"
              >
                {cooldown > 0 ? `${cooldown}s 后重发` : resending ? "发送中..." : "重新发送"}
              </button>
            </div>
          </div>

          <div className="mewmo-auth-field">
            <label>New password</label>
            <input
              name="newPassword"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              placeholder={`至少 ${PASSWORD_MIN_LENGTH} 位`}
            />
          </div>

          <div className="mewmo-auth-field">
            <label>Confirm password</label>
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              placeholder="再次输入新密码"
            />
          </div>

          {error && <p className="mewmo-auth-error">{error}</p>}

          <button type="submit" disabled={loading} className="mewmo-auth-primary">
            {loading ? "Resetting..." : "Reset password"}
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
            换个邮箱
          </button>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      eyebrow="Password reset"
      title="Reset your password"
      footer={
        <p>
          Remembered it?{" "}
          <Link href="/login">Back to login</Link>
        </p>
      }
    >
      <form onSubmit={handleRequestCode} className="mewmo-auth-form">
        <div className="mewmo-auth-field">
          <label>Email</label>
          <input name="email" type="email" required placeholder="you@example.com" />
        </div>

        {error && <p className="mewmo-auth-error">{error}</p>}

        <button type="submit" disabled={loading} className="mewmo-auth-primary">
          {loading ? "Sending..." : "发送验证码"}
        </button>
      </form>
    </AuthFrame>
  );
}
