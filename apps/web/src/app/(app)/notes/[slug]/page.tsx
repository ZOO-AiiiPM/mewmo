import { TopBar } from "../../../../components/shell/TopBar";
import { generateNotes } from "../../../../lib/mock-data";

const notes = generateNotes(1000);

export default async function NoteDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const note = notes.find((n) => n.slug === slug) ?? notes[0]!;

  return (
    <div>
      <TopBar title="Note" />
      <article className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-ink mb-3">{note.title}</h1>

        <div className="flex items-center gap-3 text-xs text-muted mb-6">
          <span>Created {new Date(note.createdAt).toLocaleDateString()}</span>
          <span>·</span>
          <span>Updated {new Date(note.updatedAt).toLocaleDateString()}</span>
          {note.tags.length > 0 && (
            <>
              <span>·</span>
              <div className="flex gap-1">
                {note.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 rounded-full bg-moss-2 text-moss text-[11px] font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="prose prose-sm text-ink leading-relaxed space-y-4">
          {note.content.split("\n\n").map((block, i) => {
            if (block.startsWith("# ")) {
              return <h1 key={i} className="text-xl font-bold mt-6 mb-3">{block.slice(2)}</h1>;
            }
            if (block.startsWith("## ")) {
              return <h2 key={i} className="text-lg font-semibold mt-5 mb-2">{block.slice(3)}</h2>;
            }
            if (block.startsWith("> ")) {
              return (
                <blockquote key={i} className="border-l-3 border-moss pl-4 italic text-muted">
                  {block.slice(2)}
                </blockquote>
              );
            }
            if (block.startsWith("- ")) {
              const items = block.split("\n").filter((l) => l.startsWith("- "));
              return (
                <ul key={i} className="list-disc pl-5 space-y-1">
                  {items.map((item, j) => (
                    <li key={j} className="text-sm">{item.slice(2)}</li>
                  ))}
                </ul>
              );
            }
            return <p key={i} className="text-sm">{block}</p>;
          })}
        </div>
      </article>
    </div>
  );
}
