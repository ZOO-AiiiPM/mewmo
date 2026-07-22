"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthFrame } from "../../../components/auth/AuthFrame";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "发送失败，请重试");
        setLoading(false);
        return;
      }

      // 防枚举：无论邮箱是否注册，都显示相同成功提示
      setSubmitted(true);
    } catch {
      setError("网络错误，请重试");
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <AuthFrame
        eyebrow="Password reset"
        title="Check your email"
        footer={
          <p>
            <Link href="/login">Back to login</Link>
          </p>
        }
      >
        <p className="mewmo-auth-info">
          如果该邮箱已注册，重置邮件已发送。请检查收件箱（及垃圾邮件文件夹）。
        </p>
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
      <form onSubmit={handleSubmit} className="mewmo-auth-form">
        <div className="mewmo-auth-field">
          <label>Email</label>
          <input name="email" type="email" required placeholder="you@example.com" />
        </div>

        {error && <p className="mewmo-auth-error">{error}</p>}

        <button type="submit" disabled={loading} className="mewmo-auth-primary">
          {loading ? "Sending..." : "Send reset link"}
        </button>
      </form>
    </AuthFrame>
  );
}
