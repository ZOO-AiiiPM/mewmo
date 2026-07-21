import { createHmac, randomUUID } from "node:crypto";

import { agentError, type AgentErrorPayload } from "./agent-contract";

const TOKEN_TTL_SECONDS = 60;
const DEFAULT_TIMEOUT_MS = 65_000;

interface AgentServerConfig {
  baseUrl: string;
  secret: string;
}

interface AgentIdentityClaims {
  sub: string;
  sid: string;
  source: "web_bff";
  aud: "mewmo-agent";
  iss: "mewmo-web";
  iat: number;
  exp: number;
  jti: string;
}

export class AgentServerUnavailableError extends Error {
  readonly code = "agent_service_unavailable";
}

export function loadAgentServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): AgentServerConfig | null {
  const baseUrl = env.AGENT_SERVER_URL?.trim();
  const secret = env.AGENT_INTERNAL_SECRET?.trim();
  if (!baseUrl || !secret || secret.length < 32) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), secret };
}

export function createAgentIdentityToken(
  userId: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const claims: AgentIdentityClaims = {
    sub: userId,
    sid: randomUUID(),
    source: "web_bff",
    aud: "mewmo-agent",
    iss: "mewmo-web",
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  };
  const payload = encodeJson(claims);
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export async function requestAgentServer(
  userId: string,
  path: string,
  init: RequestInit = {},
  options: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
) {
  const config = loadAgentServerConfig(options.env);
  if (!config) {
    throw new AgentServerUnavailableError(
      "Agent service is not configured. Set AGENT_SERVER_URL and AGENT_INTERNAL_SECRET.",
    );
  }

  const requestId = randomUUID();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(`${config.baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...init.headers,
        Authorization: `Bearer ${createAgentIdentityToken(userId, config.secret)}`,
        "X-Request-Id": requestId,
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function proxyAgentResponse(request: Promise<Response>) {
  try {
    const upstream = await request;
    const body = await upstream.text();
    return new Response(body || null, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const unavailable = error instanceof AgentServerUnavailableError;
    const aborted = error instanceof Error && error.name === "AbortError";
    const payload: AgentErrorPayload = unavailable
      ? agentError("agent_not_configured", "Agent 服务尚未配置，请稍后再试。", false)
      : aborted
        ? agentError("agent_timeout", "Agent 响应超时，请重试。", true)
        : agentError("agent_unreachable", "暂时无法连接 Agent 服务，请重试。", true);
    return Response.json(payload, { status: unavailable ? 503 : 502 });
  }
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
