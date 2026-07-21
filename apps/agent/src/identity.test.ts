import { describe, expect, it } from "vitest";
import { signIdentityForTest, verifyIdentity } from "./identity";
import { TEST_ACTOR } from "./testing";

const options = {
  secret: "test-secret-that-is-at-least-thirty-two-characters",
  issuer: "mewmo-web",
  audience: "mewmo-agent",
};

describe("Agent identity", () => {
  it("accepts only a signed short-lived Web BFF identity", async () => {
    const token = await signIdentityForTest(TEST_ACTOR, options);
    await expect(verifyIdentity(token, options)).resolves.toEqual(TEST_ACTOR);
  });

  it("rejects tokens signed for a different audience", async () => {
    const token = await signIdentityForTest(TEST_ACTOR, { ...options, audience: "other-service" });
    await expect(verifyIdentity(token, options)).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("rejects expired tokens", async () => {
    const token = await signIdentityForTest(TEST_ACTOR, options, "-10s");
    await expect(verifyIdentity(token, options)).rejects.toMatchObject({ code: "unauthorized" });
  });
});
