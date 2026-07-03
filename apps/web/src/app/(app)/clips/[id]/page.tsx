import { notFound, redirect } from "next/navigation";
import { getPrisma } from "@mewmo/db";
import { TopBar } from "../../../../components/shell/TopBar";
import { auth } from "../../../../lib/auth";

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function toPlainText(content: string) {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function ClipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const prisma = getPrisma();
  const clip = await prisma.clip.findFirst({
    where: { id, userId: session.user.id, deletedAt: null },
  });

  if (!clip) notFound();

  const contentText = toPlainText(clip.content);
  const domain = getDomain(clip.url);

  return (
    <div>
      <TopBar title="Clip" />
      <article className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-ink mb-2">{clip.title}</h1>

        <div className="flex items-center gap-2 text-xs text-muted mb-6">
          <a
            href={clip.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-moss hover:underline"
          >
            {domain} ↗
          </a>
          <span>·</span>
          <span>Saved {new Date(clip.createdAt).toLocaleDateString()}</span>
          <span>·</span>
          <span>Updated {new Date(clip.updatedAt).toLocaleDateString()}</span>
        </div>

        {clip.summary && (
          <div className="rounded-md border border-moss/20 bg-moss-2/30 p-4 mb-6">
            <div className="text-[11px] uppercase tracking-wider text-moss font-medium mb-1">
              Summary
            </div>
            <p className="text-sm text-ink">{clip.summary}</p>
          </div>
        )}

        <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
          {contentText || "No readable content saved for this clip."}
        </div>
      </article>
    </div>
  );
}
