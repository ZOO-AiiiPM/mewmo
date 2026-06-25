import { describe, expect, it, vi } from "vitest";

import { createEmailService } from "./messages";

describe("email messages", () => {
  it("sends verification links", async () => {
    const send = vi.fn().mockResolvedValue({ id: "email-1" });
    const email = createEmailService({ emails: { send } }, {
      EMAIL_FROM: "Mewmo <login@mewmo.app>",
      NEXTAUTH_URL: "http://localhost:3000",
    });

    await email.sendVerification("user@example.com", "token-1");

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: "Mewmo <login@mewmo.app>",
      to: "user@example.com",
      subject: "Sign in to Mewmo",
    }));
  });

  it("sends password reset links", async () => {
    const send = vi.fn().mockResolvedValue({ id: "email-1" });
    const email = createEmailService({ emails: { send } }, {
      EMAIL_FROM: "Mewmo <login@mewmo.app>",
      NEXTAUTH_URL: "http://localhost:3000",
    });

    await email.sendPasswordReset("user@example.com", "token-2");

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      subject: "Reset your Mewmo password",
      to: "user@example.com",
    }));
  });
});
