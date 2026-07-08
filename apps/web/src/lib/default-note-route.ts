interface DefaultNoteRouteInput {
  loading: boolean;
  query: string;
  notes: Array<{ slug: string }>;
}

export function getDefaultNoteRoute({ loading, query, notes }: DefaultNoteRouteInput) {
  if (loading || query.trim() || notes.length === 0) return null;
  return `/notes/${notes[0]!.slug}`;
}
