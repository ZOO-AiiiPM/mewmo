export interface KnowledgeFolderRow {
  id: string;
  name: string;
  parentId?: string | null;
  depth: number;
  position?: number | null;
}

export interface KnowledgeFolderNode extends KnowledgeFolderRow {
  children: KnowledgeFolderNode[];
}

export function canCreateKnowledgeSubfolder(depth: number) {
  return depth < 3;
}

export function knowledgeFolderPadding(depth: number) {
  return 32 + depth * 12;
}

export function buildKnowledgeFolderTree(folders: KnowledgeFolderRow[]) {
  const nodes = new Map<string, KnowledgeFolderNode>();
  const roots: KnowledgeFolderNode[] = [];

  for (const folder of [...folders].sort(compareFolders)) {
    nodes.set(folder.id, { ...folder, parentId: folder.parentId ?? null, children: [] });
  }

  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function compareFolders(a: KnowledgeFolderRow, b: KnowledgeFolderRow) {
  return (
    a.depth - b.depth ||
    (a.position ?? 0) - (b.position ?? 0) ||
    a.name.localeCompare(b.name, "zh-CN")
  );
}
