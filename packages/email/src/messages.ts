import { loadEnv } from "@mewmo/shared";

import { createEmailClient } from "./client";

interface EmailClient {
  emails: {
    send(input: { from: string; to: string; subject: string; html: string }): Promise<unknown>;
  };
}

interface EmailEnv {
  EMAIL_FROM: string;
  NEXTAUTH_URL: string;
}

function tokenUrl(baseUrl: string, path: string, email: string, token: string) {
  const url = new URL(path, baseUrl);
  url.searchParams.set("email", email);
  url.searchParams.set("token", token);
  return url.toString();
}

export function createEmailService(client: EmailClient = createEmailClient(), env: EmailEnv = loadEnv()) {
  return {
    sendVerification(email: string, token: string) {
      const url = tokenUrl(env.NEXTAUTH_URL, "/api/auth/callback/resend", email, token);

      return client.emails.send({
        from: env.EMAIL_FROM,
        to: email,
        subject: "Sign in to Mewmo",
        html: `<p>Sign in to Mewmo:</p><p><a href="${url}">${url}</a></p>`,
      });
    },

    sendOtp(email: string, code: string, kind: "register" | "reset") {
      const action = kind === "register" ? "注册" : "重置密码";
      const subject = kind === "register" ? "Verify your Mewmo email" : "Reset your Mewmo password";

      return client.emails.send({
        from: env.EMAIL_FROM,
        to: email,
        subject,
        html: [
          `<p>您的 Mewmo ${action}验证码为：</p>`,
          `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:12px 0;">${code}</p>`,
          `<p>验证码 10 分钟内有效。为了您的账号安全，请勿将验证码告知他人或转发给他人。</p>`,
        ].join(""),
      });
    },
  };
}

export const sendVerification = (email: string, token: string) =>
  createEmailService().sendVerification(email, token);

export const sendOtp = (email: string, code: string, kind: "register" | "reset") =>
  createEmailService().sendOtp(email, code, kind);
