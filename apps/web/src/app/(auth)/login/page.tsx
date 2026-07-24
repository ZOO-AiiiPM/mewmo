"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthFrame } from "../../../components/auth/AuthFrame";
import { PasswordField } from "../../../components/auth/PasswordField";

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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams.get("callbackUrl");
  const registerHref = rawCallbackUrl
    ? `/register?callbackUrl=${encodeURIComponent(rawCallbackUrl)}`
    : "/register";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Login failed");
      setLoading(false);
      return;
    }

    const callbackUrl = normalizeAuthCallbackUrl(rawCallbackUrl);
    router.push(callbackUrl || "/notes");
    router.refresh();
  }

  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    const callbackUrl = normalizeAuthCallbackUrl(rawCallbackUrl) || "/notes";
    await signIn("google", { callbackUrl });
  }

  return (
    <AuthFrame
      eyebrow="Welcome back"
      title="Log in to your workspace"
      footer={
        <p>
          Don&apos;t have an account?{" "}
          <Link href={registerHref}>
            Sign up
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="mewmo-auth-form">
        <div className="mewmo-auth-field">
          <label>Email</label>
          <input name="email" type="email" required placeholder="you@example.com" />
        </div>

        <div className="mewmo-auth-field">
          <label>Password</label>
          <PasswordField name="password" required placeholder="••••••••" />
        </div>

        <p className="mewmo-auth-help">
          <Link href="/forgot-password">忘记密码？</Link>
        </p>

        {error && <p className="mewmo-auth-error">{error}</p>}

        <button type="submit" disabled={loading} className="mewmo-auth-primary">
          {loading ? "Logging in..." : "Log in"}
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
