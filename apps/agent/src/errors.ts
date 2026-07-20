import type { AgentErrorBody, AgentErrorCode } from "./contracts";

const statuses: Record<AgentErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  confirmation_required: 409,
  timeout: 504,
  rate_limited: 429,
  dependency_unavailable: 503,
  internal_error: 500,
};

const retryable = new Set<AgentErrorCode>(["timeout", "rate_limited", "dependency_unavailable", "internal_error"]);

export class AgentError extends Error {
  readonly statusCode: number;
  readonly retryable: boolean;

  constructor(
    readonly code: AgentErrorCode,
    message: string,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message, { cause: options?.cause });
    this.name = "AgentError";
    this.statusCode = statuses[code];
    this.retryable = options?.retryable ?? retryable.has(code);
  }
}

export function toAgentError(error: unknown): AgentError {
  if (error instanceof AgentError) return error;
  if (error instanceof Error && error.name === "AbortError") return new AgentError("timeout", "Agent request timed out.");
  return new AgentError("internal_error", "Agent request failed.", { cause: error });
}

export function errorBody(error: AgentError, requestId?: string): AgentErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(requestId ? { requestId } : {}),
    },
  };
}
