"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthFrame } from "../../components/auth/AuthFrame";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
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
        body: JSON.stringify({ token, newPassword, confirmPassword }),
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

  if (!token) {
    return (
      <AuthFrame
        eyebrow="Password reset"
        title="链接无效"
        footer={
          <p>
            <Link href="/forgot-password">重新申请重置邮件</Link>
          </p>
        }
      >
        <p className="mewmo-auth-info">
          重置链接不完整。请从邮件中点击完整的链接进入此页面。
        </p>
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
