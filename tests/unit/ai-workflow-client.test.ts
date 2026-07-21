import { describe, expect, it, vi } from "vitest";
import { waitForAiRun } from "../../apps/web/src/lib/ai-workflow-client";

describe("AI workflow browser polling", () => {
  it("waits through queued and running states until success", async () => {
    const statuses = ["queued", "running", "succeeded"];
    const fetchImpl = vi.fn(async () => Response.json({ run: { status: statuses.shift() } }));
    const delay = vi.fn(async () => undefined);
    await expect(waitForAiRun("run-1", { fetchImpl, delay, maxAttempts: 3 })).resolves.toMatchObject({ status: "succeeded" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledTimes(2);
  });

  it("stops immediately on a terminal failure", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ run: { status: "failed", errorMessage: "provider failed" } }));
    await expect(waitForAiRun("run-2", { fetchImpl, delay: async () => undefined })).rejects.toThrow("provider failed");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the run never reaches a terminal state", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ run: { status: "queued" } }));
    await expect(waitForAiRun("run-3", { fetchImpl, delay: async () => undefined, maxAttempts: 2 })).rejects.toThrow("timed out");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
