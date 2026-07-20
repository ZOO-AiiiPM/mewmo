import { describe, expect, it } from "vitest";

import { createAgentIdentityToken, loadAgentServerConfig } from "../../apps/web/src/lib/agent-server-client";
import { verifyIdentity } from "../../apps/agent/src/identity";

describe("agent server identity boundary", () => {
  it("requires both internal service settings", () => {
    const secret = "integration-secret-with-at-least-32-characters";
    expect(loadAgentServerConfig({})).toBeNull();
    expect(loadAgentServerConfig({ AGENT_SERVER_URL: "https://agent.example" })).toBeNull();
    expect(loadAgentServerConfig({ AGENT_INTERNAL_SECRET: "secret" })).toBeNull();
    expect(loadAgentServerConfig({ AGENT_SERVER_URL: "https://agent.example/", AGENT_INTERNAL_SECRET: "secret" })).toBeNull();
    expect(loadAgentServerConfig({ AGENT_SERVER_URL: "https://agent.example/", AGENT_INTERNAL_SECRET: secret })).toEqual({
      baseUrl: "https://agent.example",
      secret,
    });
  });

  it("issues a short-lived user-scoped token without exposing the secret", () => {
    const secret = "private-secret-with-at-least-32-characters";
    const token = createAgentIdentityToken("user_123", secret, 1_000);
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString())).toMatchObject({
      sub: "user_123",
      source: "web_bff",
      aud: "mewmo-agent",
      iss: "mewmo-web",
      iat: 1_000,
      exp: 1_060,
    });
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString()).sid).toEqual(expect.any(String));
    expect(signature).toBeTruthy();
    expect(token).not.toContain(secret);
  });

  it("produces a token accepted by the Agent service identity verifier", async () => {
    const secret = "integration-secret-with-at-least-32-characters";
    const token = createAgentIdentityToken("user_123", secret);
    await expect(
      verifyIdentity(token, { secret, issuer: "mewmo-web", audience: "mewmo-agent" }),
    ).resolves.toMatchObject({
      userId: "user_123",
      source: "internal-agent",
      scopes: ["content:read", "notes:write", "knowledge:write", "trash:write"],
    });
  });
});
