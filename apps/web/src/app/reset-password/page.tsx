"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthFrame } from "../../components/auth/AuthFrame";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const prefillEmail = searchParams.get("email") || "";
  const [email, setEmail] = useState(prefillEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

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

  return (
    <AuthFrame
      eyebrow="Password reset"
      title="Set a new password"
      footer={
        <p>
          <Link href="/login">Back to login</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="mewmo-auth-form">
        <div className="mewmo-auth-field">
          <label>Email</label>
          <input
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="mewmo-auth-field">
          <label>验证码</label>
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
        </div>

        <div className="mewmo-auth-field">
          <label>New password</label>
          <input
            name="newPassword"
            type="password"
            required
            minLength={8}
            placeholder="至少 8 位"
          />
        </div>

        <div className="mewmo-auth-field">
          <label>Confirm password</label>
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            placeholder="再次输入新密码"
          />
        </div>

        {error && <p className="mewmo-auth-error">{error}</p>}

        <button type="submit" disabled={loading} className="mewmo-auth-primary">
          {loading ? "Resetting..." : "Reset password"}
        </button>
      </form>
    </AuthFrame>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
