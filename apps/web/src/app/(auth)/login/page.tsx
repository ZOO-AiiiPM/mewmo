import Link from "next/link";
import { signIn } from "../../../lib/auth";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-2xl font-extrabold text-moss">mewmo</span>
          <p className="text-sm text-muted mt-2">Welcome back</p>
        </div>

        <div className="rounded-lg border border-line bg-paper-2 p-6 space-y-4">
          <form
            action={async (formData: FormData) => {
              "use server";
              await signIn("credentials", {
                email: formData.get("email") as string,
                password: formData.get("password") as string,
                redirectTo: "/notes",
              });
            }}
          >
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

            <button
              type="submit"
              className="w-full py-2.5 rounded-md bg-moss text-white text-sm font-medium hover:bg-moss/90 transition-colors"
            >
              Log in
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

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/notes" });
            }}
          >
            <button
              type="submit"
              className="w-full py-2.5 rounded-md border border-line bg-paper text-sm font-medium text-ink hover:bg-mist/30 transition-colors flex items-center justify-center gap-2"
            >
              <span>G</span>
              Continue with Google
            </button>
          </form>
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
