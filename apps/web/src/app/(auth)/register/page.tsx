"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthFrame } from "../../../components/auth/AuthFrame";

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
      setError("请输入有效的邮箱");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 位");
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
        setError("验证码发送过于频繁，请稍后再试");
        return;
      }
      if (res.status === 409) {
        setError("该邮箱已注册，请直接登录");
        return;
      }
      if (!res.ok) {
        setError("发送失败，请重试");
        return;
      }

      setSent(true);
      setCooldown(60);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSendingCode(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }
    if (!code || code.length !== 6) {
      setError("请输入 6 位邮箱验证码");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, code }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Registration failed");
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
      eyebrow="Create your workspace"
      title="Start collecting what matters"
      footer={
        <p>
          Already have an account?{" "}
          <Link href={loginHref}>
            Log in
          </Link>
        </p>
      }
    >
      <form ref={formRef} onSubmit={handleSubmit} className="mewmo-auth-form">
        <div className="mewmo-auth-field">
          <label>Name</label>
          <input name="name" type="text" placeholder="Your name" />
        </div>

        <div className="mewmo-auth-field">
          <label>Email</label>
          <input name="email" type="email" required placeholder="you@example.com" />
        </div>

        <div className="mewmo-auth-field">
          <label>Password</label>
          <input name="password" type="password" required minLength={6} placeholder="••••••••" />
        </div>

        <div className="mewmo-auth-field">
          <label>验证码</label>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="6 位邮箱验证码"
              required
              style={{ flex: 1, minWidth: 0 }}
            />
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sendingCode || cooldown > 0}
              className="mewmo-auth-secondary"
              style={{ whiteSpace: "nowrap", flexShrink: 0 }}
            >
              {cooldown > 0
                ? `${cooldown}s 后重发`
                : sendingCode
                  ? "发送中..."
                  : sent
                    ? "重新发送"
                    : "获取验证码"}
            </button>
          </div>
        </div>

        {error && <p className="mewmo-auth-error">{error}</p>}

        <button type="submit" disabled={loading} className="mewmo-auth-primary">
          {loading ? "Creating..." : "Create account"}
        </button>
      </form>

      <div className="mewmo-auth-divider">
        <span>or</span>
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading}
        className="mewmo-auth-secondary"
      >
        <span className="mewmo-auth-google-mark">G</span>
        {googleLoading ? "Opening Google..." : "Continue with Google"}
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
