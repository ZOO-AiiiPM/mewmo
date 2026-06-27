import { TopBar } from "../../../../components/shell/TopBar";
import { generateClips } from "../../../../lib/mock-data";

const clips = generateClips(1000);

export default async function ClipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clip = clips.find((c) => c.id === id) ?? clips[0]!;

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
            {clip.domain} ↗
          </a>
          <span>·</span>
          <span>Saved {new Date(clip.createdAt).toLocaleDateString()}</span>
        </div>

        <div className="rounded-md border border-moss/20 bg-moss-2/30 p-4 mb-6">
          <div className="text-[11px] uppercase tracking-wider text-moss font-medium mb-1">
            AI Summary
          </div>
          <p className="text-sm text-ink">{clip.summary}</p>
        </div>

        <div
          className="text-sm text-ink leading-relaxed space-y-3"
          dangerouslySetInnerHTML={{ __html: clip.content }}
        />
      </article>
    </div>
  );
}
