import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <span className="text-xl font-extrabold text-moss tracking-tight">mewmo</span>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-muted hover:text-ink transition-colors">
            Log in
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 rounded-md bg-moss text-white text-sm font-medium hover:bg-moss/90 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-20 pb-32 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-ink leading-tight mb-6">
          Your AI-powered
          <br />
          <span className="text-moss">knowledge workspace</span>
        </h1>
        <p className="text-lg text-muted max-w-xl mx-auto mb-10">
          Collect, record, and rediscover what matters. mewmo helps you capture web articles,
          write notes, subscribe to feeds, and let AI surface connections you missed.
        </p>
        <Link
          href="/register"
          className="inline-block px-6 py-3 rounded-md bg-moss text-white text-base font-medium hover:bg-moss/90 transition-colors"
        >
          Start for free →
        </Link>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <FeatureCard
            title="Collect"
            description="Clip web articles, subscribe to RSS feeds, and save anything worth reading later."
          />
          <FeatureCard
            title="Record"
            description="Write markdown notes with tags. Your thoughts live alongside your collected knowledge."
          />
          <FeatureCard
            title="Rediscover"
            description="AI reviews your library, surfaces patterns, and helps you connect ideas across sources."
          />
        </div>
      </main>

      <footer className="border-t border-line py-8 text-center text-sm text-muted">
        © 2026 mewmo. Built for curious minds.
      </footer>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-line bg-paper-2 p-5">
      <h3 className="text-base font-semibold text-ink mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{description}</p>
    </div>
  );
}
