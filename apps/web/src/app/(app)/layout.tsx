import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "../../lib/auth";
import { AppShell } from "../../components/shell/AppShell";
import { ToastProvider } from "../../components/ui/ToastProvider";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <ToastProvider>
      <AppShell user={session.user}>{children}</AppShell>
    </ToastProvider>
  );
}
