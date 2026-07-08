"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

    router.push(loginHref);
  }

  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    await signIn("google", { callbackUrl: normalizeAuthCallbackUrl(callbackUrl) || "/notes" });
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-2xl font-extrabold text-moss">mewmo</span>
          <p className="text-sm text-muted mt-2">Create your workspace</p>
        </div>

        <div className="rounded-lg border border-line bg-paper-2 p-6 space-y-4">
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1 mb-3">
              <label className="text-sm font-medium text-ink">Name</label>
              <input
                name="name"
                type="text"
                placeholder="Your name"
                className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted outline-none focus:border-moss"
              />
            </div>

            <div className="flex flex-col gap-1 mb-3">
              <label className="text-sm font-medium text-ink">Email</label>
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted outline-none focus:border-moss"
              />
            </div>

            <div className="flex flex-col gap-1 mb-4">
              <label className="text-sm font-medium text-ink">Password</label>
              <input
                name="password"
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted outline-none focus:border-moss"
              />
            </div>

            {error && (
              <p className="text-xs text-coral mb-3">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-md bg-moss text-white text-sm font-medium hover:bg-moss/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create account"}
            </button>
          </form>

          <div className="relative py-3">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-line" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-paper-2 px-2 text-xs text-muted">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full py-2.5 rounded-md border border-line bg-paper text-sm font-medium text-ink hover:bg-mist/30 transition-colors flex items-center justify-center gap-2"
          >
            <span>G</span>
            {googleLoading ? "Opening Google..." : "Continue with Google"}
          </button>
        </div>

        <p className="text-center text-sm text-muted mt-4">
          Already have an account?{" "}
          <Link href={loginHref} className="text-moss hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
