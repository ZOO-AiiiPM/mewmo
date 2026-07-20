export type DomainErrorCode =
  | "not_found"
  | "forbidden"
  | "conflict"
  | "confirmation_required"
  | "invalid_state"
  | "already_exists";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function assertScope(scopes: readonly string[], required: string) {
  if (!scopes.includes(required) && !scopes.includes("*")) {
    throw new DomainError("forbidden", `missing required scope: ${required}`);
  }
}
