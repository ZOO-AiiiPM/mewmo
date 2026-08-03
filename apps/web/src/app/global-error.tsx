"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <main className="grid min-h-dvh place-items-center bg-paper p-6 text-ink">
          <div className="max-w-sm text-center">
            <h1 className="text-lg font-semibold">页面暂时无法打开</h1>
            <p className="mt-2 text-sm text-muted">
              请重试；如果问题持续，请稍后再试。
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-5 rounded-md border border-line bg-paper-2 px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-mist"
            >
              重试
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
