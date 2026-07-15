import { describe, expect, it, vi } from "vitest";

import {
  AccountPasswordError,
  updateAccountPassword,
} from "./account-password";

function createDeps(storedPassword: string | null | undefined) {
  return {
    findPassword: vi.fn().mockResolvedValue(storedPassword),
    verifyPassword: vi.fn(
      async (value: string, hash: string) => hash === `hash:${value}`,
    ),
    hashPassword: vi.fn(async (value: string) => `new-hash:${value}`),
    updatePassword: vi.fn(async () => undefined),
  };
}

async function expectFailure(
  promise: Promise<unknown>,
  code: AccountPasswordError["code"],
) {
  await expect(promise).rejects.toMatchObject({ code });
  await expect(promise).rejects.toBeInstanceOf(AccountPasswordError);
}

describe("updateAccountPassword", () => {
  it("changes an existing password after verifying the current password", async () => {
    const deps = createDeps("hash:current-password");

    const result = await updateAccountPassword(
      "user-1",
      {
        currentPassword: "current-password",
        newPassword: "new-password",
        confirmPassword: "new-password",
      },
      deps,
    );

    expect(result).toEqual({ mode: "changed" });
    expect(deps.verifyPassword).toHaveBeenNthCalledWith(
      1,
      "current-password",
      "hash:current-password",
    );
    expect(deps.verifyPassword).toHaveBeenNthCalledWith(
      2,
      "new-password",
      "hash:current-password",
    );
    expect(deps.hashPassword).toHaveBeenCalledWith("new-password");
    expect(deps.updatePassword).toHaveBeenCalledWith(
      "user-1",
      "new-hash:new-password",
    );
  });

  it("creates a password for a passwordless user without verification", async () => {
    const deps = createDeps(null);

    const result = await updateAccountPassword(
      "user-1",
      {
        newPassword: "first-password",
        confirmPassword: "first-password",
      },
      deps,
    );

    expect(result).toEqual({ mode: "created" });
    expect(deps.verifyPassword).not.toHaveBeenCalled();
    expect(deps.hashPassword).toHaveBeenCalledWith("first-password");
    expect(deps.updatePassword).toHaveBeenCalledWith(
      "user-1",
      "new-hash:first-password",
    );
  });

  it("rejects a missing current password for an existing password", async () => {
    const deps = createDeps("hash:current-password");

    await expectFailure(
      updateAccountPassword(
        "user-1",
        { newPassword: "new-password", confirmPassword: "new-password" },
        deps,
      ),
      "CURRENT_PASSWORD_REQUIRED",
    );

    expect(deps.verifyPassword).not.toHaveBeenCalled();
    expect(deps.hashPassword).not.toHaveBeenCalled();
    expect(deps.updatePassword).not.toHaveBeenCalled();
  });

  it("treats an empty current password as missing", async () => {
    const deps = createDeps("hash:current-password");

    await expectFailure(
      updateAccountPassword(
        "user-1",
        {
          currentPassword: "",
          newPassword: "new-password",
          confirmPassword: "new-password",
        },
        deps,
      ),
      "CURRENT_PASSWORD_REQUIRED",
    );

    expect(deps.verifyPassword).not.toHaveBeenCalled();
    expect(deps.hashPassword).not.toHaveBeenCalled();
    expect(deps.updatePassword).not.toHaveBeenCalled();
  });

  it("rejects an incorrect current password", async () => {
    const deps = createDeps("hash:current-password");

    await expectFailure(
      updateAccountPassword(
        "user-1",
        {
          currentPassword: "wrong-password",
          newPassword: "new-password",
          confirmPassword: "new-password",
        },
        deps,
      ),
      "CURRENT_PASSWORD_INCORRECT",
    );

    expect(deps.hashPassword).not.toHaveBeenCalled();
    expect(deps.updatePassword).not.toHaveBeenCalled();
  });

  it("rejects reusing the existing password", async () => {
    const deps = createDeps("hash:current-password");

    await expectFailure(
      updateAccountPassword(
        "user-1",
        {
          currentPassword: "current-password",
          newPassword: "current-password",
          confirmPassword: "current-password",
        },
        deps,
      ),
      "PASSWORD_UNCHANGED",
    );

    expect(deps.hashPassword).not.toHaveBeenCalled();
    expect(deps.updatePassword).not.toHaveBeenCalled();
  });

  it("rejects a new password shorter than eight characters", async () => {
    const deps = createDeps(null);

    await expectFailure(
      updateAccountPassword(
        "user-1",
        { newPassword: "short", confirmPassword: "short" },
        deps,
      ),
      "PASSWORD_TOO_SHORT",
    );

    expect(deps.findPassword).not.toHaveBeenCalled();
    expect(deps.verifyPassword).not.toHaveBeenCalled();
    expect(deps.hashPassword).not.toHaveBeenCalled();
    expect(deps.updatePassword).not.toHaveBeenCalled();
  });

  it("rejects a password confirmation mismatch", async () => {
    const deps = createDeps(null);

    await expectFailure(
      updateAccountPassword(
        "user-1",
        {
          newPassword: "new-password",
          confirmPassword: "other-password",
        },
        deps,
      ),
      "PASSWORD_CONFIRMATION_MISMATCH",
    );

    expect(deps.findPassword).not.toHaveBeenCalled();
    expect(deps.verifyPassword).not.toHaveBeenCalled();
    expect(deps.hashPassword).not.toHaveBeenCalled();
    expect(deps.updatePassword).not.toHaveBeenCalled();
  });

  it("rejects a missing user", async () => {
    const deps = createDeps(undefined);

    await expectFailure(
      updateAccountPassword(
        "missing-user",
        { newPassword: "new-password", confirmPassword: "new-password" },
        deps,
      ),
      "USER_NOT_FOUND",
    );

    expect(deps.verifyPassword).not.toHaveBeenCalled();
    expect(deps.hashPassword).not.toHaveBeenCalled();
    expect(deps.updatePassword).not.toHaveBeenCalled();
  });
});
