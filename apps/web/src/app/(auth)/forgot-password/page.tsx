"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthFrame } from "../../../components/auth/AuthFrame";

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const value = (formData.get("email") as string) || "";
    setEmail(value);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
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
          如果该邮箱已注册，验证码已发送。请查收邮件中的 6 位验证码，并在重置页输入。
        </p>
        <p className="mewmo-auth-info">
          <Link href={`/reset-password?email=${encodeURIComponent(email)}`}>
            前往输入验证码
          </Link>
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
          {loading ? "Sending..." : "发送验证码"}
        </button>
      </form>
    </AuthFrame>
  );
}
