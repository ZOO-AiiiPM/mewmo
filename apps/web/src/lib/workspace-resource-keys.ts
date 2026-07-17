export const workspaceResourceKeys = {
  notesList: () => "notes:list",
  noteDetail: (id: string) => `notes:detail:${id}`,
  clipsList: () => "clips:list",
  clipDetail: (id: string) => `clips:detail:${id}`,
  selection: (section: "notes" | "clips") => `selection:${section}`,
  feedSources: (type: string) => `feeds:sources:${type}`,
  feedEntries: (feedId: string) => `feeds:entries:${feedId}`,
  aggregateFeedEntries: (type: string) => `feeds:entries:all:${type}`,
  feedEntryDetail: (id: string) => `feeds:detail:${id}`,
  todayList: () => "today:list",
  trashList: () => "trash:list",
  trashDetail: (kind: string, id: string) => `trash:detail:${kind}:${id}`,
  knowledgeBases: () => "knowledge:bases",
  knowledgeTree: (knowledgeBaseId: string) => `knowledge:tree:${knowledgeBaseId}`,
  knowledgeContents: (knowledgeBaseId: string, folderId: string) =>
    `knowledge:contents:${knowledgeBaseId}:${folderId}`,
};
