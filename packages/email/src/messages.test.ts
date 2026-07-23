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

  it("sends a 6-digit OTP code (not a link) for register", async () => {
    const send = vi.fn().mockResolvedValue({ id: "email-1" });
    const email = createEmailService({ emails: { send } }, {
      EMAIL_FROM: "Mewmo <login@mewmo.app>",
      NEXTAUTH_URL: "http://localhost:3000",
    });

    await email.sendOtp("user@example.com", "482913", "register");

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: "Mewmo <login@mewmo.app>",
      to: "user@example.com",
      subject: "Verify your Mewmo email",
      html: expect.stringContaining("482913"),
    }));
    // OTP email must NOT contain a reset/verification link
    expect(send.mock.calls[0]?.[0]?.html).not.toContain("http");
  });

  it("sends an OTP code for reset", async () => {
    const send = vi.fn().mockResolvedValue({ id: "email-1" });
    const email = createEmailService({ emails: { send } }, {
      EMAIL_FROM: "Mewmo <login@mewmo.app>",
      NEXTAUTH_URL: "http://localhost:3000",
    });

    await email.sendOtp("user@example.com", "120045", "reset");

    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      subject: "Reset your Mewmo password",
      html: expect.stringContaining("120045"),
    }));
  });
});
