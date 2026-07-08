import { describe, expect, it } from "vitest";

import {
  buildKnowledgeFolderTree,
  canCreateKnowledgeSubfolder,
  knowledgeFolderPadding,
} from "../../apps/web/src/lib/knowledge-tree";

describe("knowledge tree helpers", () => {
  it("builds nested folders from flat API rows without losing prototype depth", () => {
    const tree = buildKnowledgeFolderTree([
      { id: "research", name: "调研", parentId: null, depth: 0, position: 0 },
      { id: "comp", name: "竞品分析", parentId: null, depth: 0, position: 1 },
      { id: "cn", name: "国内", parentId: "comp", depth: 1, position: 0 },
      { id: "notes", name: "笔记类", parentId: "cn", depth: 2, position: 0 },
    ]);

    expect(tree.map((item) => item.name)).toEqual(["调研", "竞品分析"]);
    expect(tree[1]?.children[0]?.name).toBe("国内");
    expect(tree[1]?.children[0]?.children[0]?.name).toBe("笔记类");
  });

  it("allows new folders only above the fourth prototype level", () => {
    expect(canCreateKnowledgeSubfolder(0)).toBe(true);
    expect(canCreateKnowledgeSubfolder(2)).toBe(true);
    expect(canCreateKnowledgeSubfolder(3)).toBe(false);
  });

  it("keeps nested folders on the original compact indentation rhythm", () => {
    expect(knowledgeFolderPadding(0)).toBe(32);
    expect(knowledgeFolderPadding(1)).toBe(44);
    expect(knowledgeFolderPadding(2)).toBe(56);
    expect(knowledgeFolderPadding(3)).toBe(68);
  });
});
