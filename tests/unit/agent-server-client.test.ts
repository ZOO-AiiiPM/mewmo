import { describe, expect, it } from "vitest";

import { createAgentIdentityToken, loadAgentServerConfig } from "../../apps/web/src/lib/agent-server-client";

describe("agent server identity boundary", () => {
  it("requires both internal service settings", () => {
    expect(loadAgentServerConfig({})).toBeNull();
    expect(loadAgentServerConfig({ AGENT_SERVER_URL: "https://agent.example" })).toBeNull();
    expect(loadAgentServerConfig({ AGENT_INTERNAL_SECRET: "secret" })).toBeNull();
    expect(loadAgentServerConfig({ AGENT_SERVER_URL: "https://agent.example/", AGENT_INTERNAL_SECRET: "secret" })).toEqual({
      baseUrl: "https://agent.example",
      secret: "secret",
    });
  });

  it("issues a short-lived user-scoped token without exposing the secret", () => {
    const token = createAgentIdentityToken("user_123", "private-secret", 1_000);
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString())).toMatchObject({
      sub: "user_123",
      aud: "mewmo-agent",
      iss: "mewmo-web",
      iat: 1_000,
      exp: 1_060,
    });
    expect(signature).toBeTruthy();
    expect(token).not.toContain("private-secret");
  });
});
