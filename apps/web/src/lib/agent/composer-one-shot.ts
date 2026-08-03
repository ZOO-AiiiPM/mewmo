export interface ComposerSendOptions {
  content: string;
  skillId?: string;
  thinking?: boolean;
  includeContext: boolean;
  editTurnId?: string;
}

export function buildComposerSendOptions({
  content,
  skillId,
  thinking,
  includeContext,
  editTurnId,
}: {
  content: string;
  skillId?: string;
  thinking: boolean;
  includeContext: boolean;
  editTurnId?: string;
}): ComposerSendOptions {
  return {
    content,
    ...(skillId ? { skillId } : {}),
    ...(thinking ? { thinking: true } : {}),
    includeContext,
    ...(editTurnId ? { editTurnId } : {}),
  };
}
