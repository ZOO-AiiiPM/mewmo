import { getPrisma } from "@mewmo/db";
import { redirect } from "next/navigation";

import { auth } from "../../../lib/auth";
import { AccountSettingsClient } from "./AccountSettingsClient";
import { getLocalizedLoginMethods } from "./login-methods";

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
