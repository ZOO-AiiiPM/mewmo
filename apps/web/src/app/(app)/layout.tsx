import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "../../lib/auth";
import { AppShell } from "../../components/shell/AppShell";
import { ToastProvider } from "../../components/ui/ToastProvider";
import { MoveToKnowledgeProvider } from "../../components/knowledge/MoveToKnowledgeProvider";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <ToastProvider>
      <MoveToKnowledgeProvider>
        <AppShell user={session.user}>{children}</AppShell>
      </MoveToKnowledgeProvider>
    </ToastProvider>
  );
}
