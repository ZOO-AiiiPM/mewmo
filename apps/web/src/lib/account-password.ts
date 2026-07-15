export type AccountPasswordErrorCode =
  | "USER_NOT_FOUND"
  | "CURRENT_PASSWORD_REQUIRED"
  | "CURRENT_PASSWORD_INCORRECT"
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_CONFIRMATION_MISMATCH"
  | "PASSWORD_UNCHANGED";

export class AccountPasswordError extends Error {
  constructor(public readonly code: AccountPasswordErrorCode) {
    super(code);
    this.name = "AccountPasswordError";
  }
}

export interface UpdateAccountPasswordInput {
  currentPassword?: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UpdateAccountPasswordDeps {
  findPassword(
    userId: string,
  ): Promise<string | null | undefined> | string | null | undefined;
  verifyPassword(value: string, hash: string): Promise<boolean> | boolean;
  hashPassword(value: string): Promise<string> | string;
  updatePassword(userId: string, hash: string): Promise<unknown> | unknown;
}

export type UpdateAccountPasswordResult =
  | { mode: "changed" }
  | { mode: "created" };

export async function updateAccountPassword(
  userId: string,
  input: UpdateAccountPasswordInput,
  deps: UpdateAccountPasswordDeps,
): Promise<UpdateAccountPasswordResult> {
  const newPassword = input.newPassword;
  if (newPassword.length < 8) {
    throw new AccountPasswordError("PASSWORD_TOO_SHORT");
  }
  if (input.confirmPassword !== newPassword) {
    throw new AccountPasswordError("PASSWORD_CONFIRMATION_MISMATCH");
  }

  const storedPassword = await deps.findPassword(userId);
  if (storedPassword === undefined) {
    throw new AccountPasswordError("USER_NOT_FOUND");
  }

  if (storedPassword !== null) {
    if (!input.currentPassword) {
      throw new AccountPasswordError("CURRENT_PASSWORD_REQUIRED");
    }
    if (!(await deps.verifyPassword(input.currentPassword, storedPassword))) {
      throw new AccountPasswordError("CURRENT_PASSWORD_INCORRECT");
    }
    if (await deps.verifyPassword(newPassword, storedPassword)) {
      throw new AccountPasswordError("PASSWORD_UNCHANGED");
    }
  }

  const hash = await deps.hashPassword(newPassword);
  await deps.updatePassword(userId, hash);

  return { mode: storedPassword === null ? "created" : "changed" };
}
