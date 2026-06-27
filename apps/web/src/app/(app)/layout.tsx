import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "../../lib/auth";
import { Sidebar } from "../../components/shell/Sidebar";
import { AISidebar } from "../../components/shell/AISidebar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar user={session.user} />
      <main className="flex-1 min-w-0">{children}</main>
      <div className="hidden lg:block">
        <AISidebar />
      </div>
    </div>
  );
}
