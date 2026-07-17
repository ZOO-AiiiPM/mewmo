export function createServerTiming() {
  const startedAt = performance.now();
  const metrics: string[] = [];

  return {
    async measure<T>(name: string, operation: () => Promise<T>) {
      const start = performance.now();
      const value = await operation();
      metrics.push(`${name};dur=${(performance.now() - start).toFixed(1)}`);
      return value;
    },
    header() {
      return [...metrics, `total;dur=${(performance.now() - startedAt).toFixed(1)}`].join(", ");
    },
  };
}

export function attachServerTiming<T extends Response>(
  response: T,
  timing: { header(): string },
) {
  response.headers.set("Server-Timing", timing.header());
  return response;
}
