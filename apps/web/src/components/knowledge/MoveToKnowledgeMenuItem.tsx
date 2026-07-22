"use client";

import { useFloatingMenuClose } from "../ui/FloatingMenu";
import { PrototypeIcon } from "../shell/PrototypeIcon";
import {
  useMoveToKnowledge,
  type MoveToKnowledgeTarget,
} from "./MoveToKnowledgeProvider";

export type { MoveToKnowledgeTarget };

export function MoveToKnowledgeMenuItem({
  target,
}: {
  target: MoveToKnowledgeTarget;
}) {
  const closeMenu = useFloatingMenuClose();
  const { openMoveDialog } = useMoveToKnowledge();

  return (
    <button
      type="button"
      className="mewmo-card-menu__item"
      aria-haspopup="dialog"
      onClick={() => {
        closeMenu?.();
        openMoveDialog(target);
      }}
    >
      <span className="mewmo-card-menu__icon">
        <PrototypeIcon name="library" size={16} dual />
      </span>
      <span>移动到知识库</span>
    </button>
  );
}
