import { describe, expect, it, vi } from "vitest";

import { createActor } from "./actor";
import { createAiSkillService } from "./ai-skill-service";

describe("AI skill service", () => {
  it("scopes enabled Skill reads to the owning user", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const actor = createActor({ userId: "user-1", source: "internal-agent", clientId: "test", scopes: ["content:read"] });
    await createAiSkillService({ prisma: { aiSkill: { findMany } } as never }).list(actor);
    expect(findMany).toHaveBeenCalledWith({ where: { userId: "user-1", enabled: true }, orderBy: { updatedAt: "desc" } });
  });
});
