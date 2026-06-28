"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

    router.push("/notes");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-2xl font-extrabold text-moss">mewmo</span>
          <p className="text-sm text-muted mt-2">Welcome back</p>
        </div>

        <div className="rounded-lg border border-line bg-paper-2 p-6 space-y-4">
          <form onSubmit={handleSubmit}>
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
              {loading ? "Logging in..." : "Log in"}
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

          <a
            href="/api/auth/signin/google"
            className="w-full py-2.5 rounded-md border border-line bg-paper text-sm font-medium text-ink hover:bg-mist/30 transition-colors flex items-center justify-center gap-2"
          >
            <span>G</span>
            Continue with Google
          </a>
        </div>

        <p className="text-center text-sm text-muted mt-4">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-moss hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
