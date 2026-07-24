import { notFound, redirect } from "next/navigation";
import { getPrisma } from "@mewmo/db";
import { SharedNoteMarkdown } from "../../../../components/share/SharedNoteMarkdown";
import { ShareThemeToggle } from "../../../../components/share/ShareThemeToggle";
import { PrototypeIcon } from "../../../../components/shell/PrototypeIcon";
import { auth } from "../../../../lib/auth";

function formatSharedNoteTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function SharedNotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/share/notes/${token}`)}`);
  }

  const prisma = getPrisma();
  const share = await prisma.noteShare.findFirst({
    where: {
      token,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      note: { is: { deletedAt: null } },
    },
    include: {
      note: {
        include: {
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!share?.note) notFound();

  const ownerLabel = share.note.user.name || share.note.user.email || "mewmo 用户";

  return (
    <main className="mewmo-share-page">
      <div className="mewmo-share-shell">
        <header className="mewmo-share-topbar">
          <div className="mewmo-share-brand" aria-label="mewmo 共享笔记">
            <span className="mewmo-share-brand__mark">
              <PrototypeIcon name="mewmo-logo" size={21} />
            </span>
            <span className="mewmo-share-brand__word">mewmo</span>
            <span className="mewmo-share-brand__label">共享笔记</span>
          </div>
          <ShareThemeToggle />
        </header>

        <section className="mewmo-share-reader" aria-label="共享笔记阅读区">
          <article className="mewmo-document mewmo-document--shared-note">
            <span className="mewmo-shared-note__badge">
              <PrototypeIcon name="note" size={13} />
              来自 mewmo
            </span>
            <h1>{share.note.title}</h1>
            <div className="mewmo-doc-meta">
              <span>{ownerLabel}</span>
              <span><b aria-hidden="true">·</b>{formatSharedNoteTime(share.note.updatedAt)}</span>
            </div>
            <SharedNoteMarkdown content={share.note.content} />
          </article>
        </section>

        <footer className="mewmo-share-footer">
          <span>由 mewmo 分享</span>
          <span>只读笔记</span>
        </footer>
      </div>
    </main>
  );
}
