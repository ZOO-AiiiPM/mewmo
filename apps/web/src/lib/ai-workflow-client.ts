export async function waitForAiRun(
  runId: string,
  options: {
    fetchImpl?: typeof fetch;
    delay?: (milliseconds: number) => Promise<void>;
    maxAttempts?: number;
    intervalMs?: number;
  } = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const delay = options.delay ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const maxAttempts = options.maxAttempts ?? 80;
  const intervalMs = options.intervalMs ?? 1_500;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetchImpl(`/api/ai/runs/${encodeURIComponent(runId)}`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as { run?: { status?: string; errorMessage?: string } } | null;
    if (!response.ok || !data?.run) throw new Error("summary status unavailable");
    if (data.run.status === "succeeded") return data.run;
    if (data.run.status === "failed" || data.run.status === "superseded") {
      throw new Error(data.run.errorMessage ?? "summary workflow failed");
    }
    if (attempt < maxAttempts - 1) await delay(intervalMs);
  }
  throw new Error("summary workflow timed out");
}
