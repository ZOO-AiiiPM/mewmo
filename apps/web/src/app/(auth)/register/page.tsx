"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
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

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
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
      <form onSubmit={handleSubmit} className="mewmo-auth-form">
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
