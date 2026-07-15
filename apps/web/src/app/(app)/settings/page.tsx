import { getPrisma } from "@mewmo/db";
import { redirect } from "next/navigation";

import { auth } from "../../../lib/auth";
import { AccountSettingsClient } from "./AccountSettingsClient";

function localizeProvider(provider: string) {
  if (provider === "google") return "Google 登录";
  if (provider === "password") return "邮箱密码";
  if (provider === "email" || provider === "resend") return "邮箱登录";
  return null;
}

export function getLocalizedLoginMethods({
  hasPassword,
  email,
  providers,
}: {
  hasPassword: boolean;
  email: string | null;
  providers: string[];
}) {
  const hasGoogle = providers.includes("google");
  const methods = [
    ...(hasPassword ? ["邮箱密码"] : []),
    ...providers.flatMap((provider) => {
      const method = localizeProvider(provider);
      return method ? [method] : [];
    }),
  ];

  // Email sign-in does not create an Account row in Auth.js Resend flows.
  if (!hasPassword && !hasGoogle && providers.length === 0 && email) {
    methods.push("邮箱登录");
  }

  return Array.from(new Set(methods));
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      password: true,
      accounts: { select: { provider: true } },
    },
  });

  if (!user) redirect("/login");

  const loginMethods = getLocalizedLoginMethods({
    hasPassword: Boolean(user.password),
    email: user.email,
    providers: user.accounts.map(({ provider }) => provider),
  });

  return (
    <AccountSettingsClient
      user={{ name: user.name, email: user.email, image: user.image }}
      hasPassword={Boolean(user.password)}
      loginMethods={loginMethods}
    />
  );
}
