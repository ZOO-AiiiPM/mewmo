import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import type { AgentActor } from "./contracts";
import { AgentError } from "./errors";

const claimsSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  source: z.literal("web_bff"),
});

export interface IdentityOptions {
  secret: string;
  issuer: string;
  audience: string;
}

function secretKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function verifyIdentity(token: string, options: IdentityOptions): Promise<AgentActor> {
  try {
    const { payload } = await jwtVerify(token, secretKey(options.secret), {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: ["HS256"],
      clockTolerance: 5,
    });
    const claims = claimsSchema.parse(payload);
    return {
      userId: claims.sub,
      source: "internal-agent",
      clientId: claims.sid,
      scopes: ["content:read", "notes:write", "knowledge:write", "trash:write"],
    };
  } catch (error) {
    throw new AgentError("unauthorized", "Invalid or expired Agent identity.", { cause: error, retryable: false });
  }
}

export async function signIdentityForTest(actor: AgentActor, options: IdentityOptions, expiresIn = "60s") {
  return new SignJWT({ sid: actor.clientId, source: "web_bff" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(actor.userId)
    .setIssuer(options.issuer)
    .setAudience(options.audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey(options.secret));
}
