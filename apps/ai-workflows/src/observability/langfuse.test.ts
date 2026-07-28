import { describe, expect, it, vi } from "vitest";

import type { ClaimedAiRun } from "../contracts";
import { createConfiguredWorkflowObservability, createLangfuseWorkflowObservability, privateWorkflowUserId } from "./langfuse";

const run: ClaimedAiRun = {
  id: "run-1",
  userId: "user-private",
  kind: "summary",
  targetType: "clip",
  targetId: "clip-1",
  inputVersion: 3,
  attempt: 2,
};

const config = {
  publicKey: "pk-test",
  secretKey: "sk-test",
  baseUrl: "https://cloud.langfuse.com",
  environment: "production",
  release: "commit-123",
  userHashSecret: "hash-secret-that-is-at-least-thirty-two-characters",
  shutdownTimeoutMs: 1_000,
};

function setup() {
  const rootUpdates: Array<Record<string, unknown>> = [];
  const modelUpdates: Array<Record<string, unknown>> = [];
  const propagated: Array<Record<string, unknown>> = [];
  const modelEnd = vi.fn();
  const sdk = {
    start: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
  const dependencies = {
    createSdk: vi.fn(() => sdk),
    startRun: vi.fn(async (operation: (root: never) => Promise<void>) =>
      operation({
        update: (value: Record<string, unknown>) => rootUpdates.push(value),
      } as never),
    ),
    startModel: vi.fn(() => ({
      update: (value: Record<string, unknown>) => modelUpdates.push(value),
      end: modelEnd,
    })),
    propagate: vi.fn(async (input: Record<string, unknown>, operation: () => Promise<void>) => {
      propagated.push(input);
      await operation();
    }),
  };
  return { dependencies, modelEnd, modelUpdates, propagated, rootUpdates, sdk };
}

describe("Workflow Langfuse observability", () => {
  it("records a private run tree with model usage and no source payload", async () => {
    const fixture = setup();
    const observability = createLangfuseWorkflowObservability(config, fixture.dependencies as never);

    const status = await observability.observeRun(run, async () => {
      const value = await observability.observeModelCall(
        {
          name: "workflow.generation.summary",
          purpose: "workflow.summary",
          type: "generation",
        },
        async () => ({
          value: "not-exported",
          metadata: {
            profile: "workflow.summary",
            provider: "google",
            model: "requested-model",
            responseModel: "response-model",
            usage: {
              inputTokens: 10,
              outputTokens: 4,
              cacheReadTokens: 1,
              cacheWriteTokens: 0,
              totalTokens: 14,
              providerCostUsd: 0.012,
              pricingKnown: true,
            },
          },
        }),
      );
      expect(value).toBe("not-exported");
      return "succeeded";
    });

    expect(status).toBe("succeeded");
    expect(fixture.sdk.start).toHaveBeenCalledOnce();
    expect(fixture.propagated[0]).toMatchObject({
      userId: privateWorkflowUserId(run.userId, config.userHashSecret),
      traceName: "workflow.summary",
      version: "commit-123",
    });
    expect(fixture.rootUpdates.at(-1)).toMatchObject({
      metadata: expect.objectContaining({
        status: "succeeded",
        runId: "run-1",
      }),
    });
    expect(fixture.modelUpdates.at(-1)).toMatchObject({
      model: "response-model",
      usageDetails: {
        input: 10,
        output: 4,
        total: 14,
        cacheRead: 1,
        cacheWrite: 0,
      },
      costDetails: { total: 0.012 },
    });
    expect(fixture.modelEnd).toHaveBeenCalledOnce();

    const exported = JSON.stringify({
      propagated: fixture.propagated,
      rootUpdates: fixture.rootUpdates,
      modelUpdates: fixture.modelUpdates,
    });
    expect(exported).not.toContain(run.userId);
    expect(exported).not.toContain("not-exported");
    expect(exported).not.toContain("prompt");
    expect(exported).not.toContain("content");
  });

  it("executes business work once when trace creation fails", async () => {
    const fixture = setup();
    fixture.dependencies.startRun.mockRejectedValueOnce(new Error("telemetry unavailable"));
    const warn = vi.fn();
    const observability = createLangfuseWorkflowObservability(config, fixture.dependencies as never, warn);
    const operation = vi.fn().mockResolvedValue("succeeded");

    await expect(observability.observeRun(run, operation)).resolves.toBe("succeeded");
    expect(operation).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("without tracing"));
  });

  it("executes a model call once when its observation cannot start", async () => {
    const fixture = setup();
    fixture.dependencies.startModel.mockImplementationOnce(() => {
      throw new Error("telemetry unavailable");
    });
    const operation = vi.fn().mockResolvedValue({
      value: "ok",
      metadata: { profile: "workflow.summary" },
    });
    const observability = createLangfuseWorkflowObservability(config, fixture.dependencies as never);

    await expect(
      observability.observeModelCall(
        {
          name: "workflow.generation.summary",
          purpose: "workflow.summary",
          type: "generation",
        },
        operation,
      ),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledOnce();
  });

  it("disables tracing when the privacy hash secret is missing", async () => {
    const warn = vi.fn();
    const observability = createConfiguredWorkflowObservability(
      {
        LANGFUSE_PUBLIC_KEY: "pk-test",
        LANGFUSE_SECRET_KEY: "sk-test",
      },
      warn,
    );
    const operation = vi.fn().mockResolvedValue("succeeded");

    await expect(observability.observeRun(run, operation)).resolves.toBe("succeeded");
    expect(operation).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("incomplete"));
  });
});
