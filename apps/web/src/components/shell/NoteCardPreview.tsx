interface NoteCardPreviewProps {
  preview: string;
}

export function NoteCardPreview({ preview }: NoteCardPreviewProps) {
  const lines = preview.split("\n").filter(Boolean).slice(0, 2);

  return (
    <p className="mewmo-list-card__preview mewmo-list-card__preview--note">
      {lines.map((line, index) => (
        <span key={`${index}-${line}`}>{line}</span>
      ))}
    </p>
  );
}
