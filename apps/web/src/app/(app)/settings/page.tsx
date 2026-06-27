"use client";

import { TopBar } from "../../../components/shell/TopBar";
import { useTheme } from "../../../lib/theme";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div>
      <TopBar title="Settings" />
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Appearance */}
        <section className="rounded-lg border border-line p-5">
          <h2 className="text-base font-semibold text-ink mb-4">Appearance</h2>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted">Theme</label>
            <div className="flex gap-2">
              {(["light", "dark", "system"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    theme === t
                      ? "bg-moss text-white"
                      : "bg-paper-2 border border-line text-ink hover:bg-mist/30"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Account */}
        <section className="rounded-lg border border-line p-5">
          <h2 className="text-base font-semibold text-ink mb-4">Account</h2>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-moss-2 flex items-center justify-center text-lg font-bold text-moss">
              U
            </div>
            <div>
              <div className="text-sm font-medium text-ink">User</div>
              <div className="text-xs text-muted">user@mewmo.app</div>
            </div>
          </div>
          <button className="mt-4 px-3 py-1.5 rounded-md border border-line text-sm text-muted hover:text-ink hover:bg-paper-2 transition-colors">
            Change password
          </button>
        </section>

        {/* AI */}
        <section className="rounded-lg border border-line p-5">
          <h2 className="text-base font-semibold text-ink mb-4">AI Model</h2>
          <select className="w-full max-w-xs rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-moss">
            <option>Claude 4 Sonnet</option>
            <option>GPT-4o</option>
            <option>DeepSeek V3</option>
          </select>
          <p className="text-xs text-muted mt-2">Used for summaries, auto-tagging, and chat.</p>
        </section>

        {/* Data */}
        <section className="rounded-lg border border-line p-5">
          <h2 className="text-base font-semibold text-ink mb-4">Data</h2>
          <button className="px-3 py-1.5 rounded-md border border-line text-sm text-ink hover:bg-paper-2 transition-colors">
            Export all data
          </button>
          <p className="text-xs text-muted mt-2">Download a JSON archive of your notes, clips, and feeds.</p>
        </section>
      </div>
    </div>
  );
}
