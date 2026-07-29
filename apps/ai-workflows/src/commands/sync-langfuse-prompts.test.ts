import { describe, expect, it, vi } from "vitest";

import { promptDigest, syncCodeOwnedPrompts, type CodeOwnedPrompt } from "./sync-langfuse-prompts";

const prompt: CodeOwnedPrompt = {
  id: "workflow.article-summary.zh",
  name: "workflow/article-summary.zh",
  content: "Summarize {{article}}",
  tags: ["mewmo", "workflow"],
  config: { source: "repository", sourceVersion: 2 },
};

describe("syncCodeOwnedPrompts", () => {
  it("reuses an identical labeled version without creating duplicates", async () => {
    const client = fakeClient([remotePrompt({ version: 4 })]);

    const manifest = await syncCodeOwnedPrompts({ client: client.value as never, prompts: [prompt], label: "production", release: "commit-1" });

    expect(manifest).toEqual({ "workflow.article-summary.zh": { name: prompt.name, version: 4 } });
    expect(client.get).toHaveBeenCalledWith(prompt.name, expect.objectContaining({ label: "production" }));
    expect(client.create).not.toHaveBeenCalled();
    expect(client.update).not.toHaveBeenCalled();
  });

  it("creates once and promotes the exact version when content changes", async () => {
    const client = fakeClient(
      [
        remotePrompt({ version: 4, prompt: "old production content", labels: ["production"] }),
        remotePrompt({ version: 4, prompt: "old latest content", labels: ["latest"] }),
      ],
      remotePrompt({ version: 5, labels: ["latest"] }),
    );

    const manifest = await syncCodeOwnedPrompts({ client: client.value as never, prompts: [prompt], label: "production", release: "commit-2" });

    expect(manifest["workflow.article-summary.zh"]?.version).toBe(5);
    expect(client.create).toHaveBeenCalledOnce();
    expect(client.create).toHaveBeenCalledWith(expect.objectContaining({
      prompt: prompt.content,
      labels: [],
      commitMessage: expect.stringContaining(promptDigest(prompt)),
    }));
    expect(client.update).toHaveBeenCalledWith({ name: prompt.name, version: 5, newLabels: ["production"] });
  });

  it("promotes an identical latest version without creating another version", async () => {
    const client = fakeClient([
      remotePrompt({ version: 4, prompt: "old production content", labels: ["production"] }),
      remotePrompt({ version: 5, labels: ["latest", "staging"] }),
    ]);

    const manifest = await syncCodeOwnedPrompts({ client: client.value as never, prompts: [prompt], label: "production", release: "commit-2" });

    expect(manifest["workflow.article-summary.zh"]?.version).toBe(5);
    expect(client.create).not.toHaveBeenCalled();
    expect(client.update).toHaveBeenCalledWith({
      name: prompt.name,
      version: 5,
      newLabels: ["staging", "production"],
    });
  });

  it("does not treat non-404 fetch failures as a missing prompt", async () => {
    const client = fakeClient([]);
    client.get.mockRejectedValueOnce(Object.assign(new Error("unauthorized"), { status: 401 }));

    await expect(syncCodeOwnedPrompts({ client: client.value as never, prompts: [prompt], label: "production", release: "commit-3" })).rejects.toThrow("unauthorized");
    expect(client.create).not.toHaveBeenCalled();
  });
});

function remotePrompt(overrides: Partial<{ version: number; prompt: string; labels: string[] }> = {}) {
  return {
    name: prompt.name,
    version: overrides.version ?? 1,
    prompt: overrides.prompt ?? prompt.content,
    labels: overrides.labels ?? ["latest", "production"],
    tags: prompt.tags,
    config: { ...prompt.config, digest: promptDigest(prompt) },
  };
}

function fakeClient(responses: Array<ReturnType<typeof remotePrompt> | undefined>, created = remotePrompt({ version: 2, labels: ["latest"] })) {
  const get = vi.fn();
  for (const response of responses) {
    if (response) get.mockResolvedValueOnce(response);
    else get.mockRejectedValueOnce(Object.assign(new Error("not found"), { status: 404 }));
  }
  get.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));
  const create = vi.fn().mockResolvedValue(created);
  const update = vi.fn().mockResolvedValue(undefined);
  return { get, create, update, value: { prompt: { get, create, update } } };
}
