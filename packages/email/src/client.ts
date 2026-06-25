import { loadEnv } from "@mewmo/shared";
import { Resend } from "resend";

export function createEmailClient(env = loadEnv()) {
  return new Resend(env.RESEND_API_KEY);
}
