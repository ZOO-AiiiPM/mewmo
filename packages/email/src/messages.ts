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

    sendPasswordReset(email: string, token: string, origin: string) {
      const url = new URL("/reset-password", origin);
      url.searchParams.set("token", token);

      return client.emails.send({
        from: env.EMAIL_FROM,
        to: email,
        subject: "Reset your Mewmo password",
        html: `<p>Reset your Mewmo password:</p><p><a href="${url}">${url}</a></p>`,
      });
    },
  };
}

export const sendVerification = (email: string, token: string) =>
  createEmailService().sendVerification(email, token);

export const sendPasswordReset = (email: string, token: string, origin: string) =>
  createEmailService().sendPasswordReset(email, token, origin);
