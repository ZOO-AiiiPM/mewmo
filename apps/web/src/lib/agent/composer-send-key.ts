/**
 * #2: IME isolation for the agent composer.
 *
 * While a CJK input method is composing (拼音候选未上屏), Enter confirms the
 * candidate instead of submitting the message. `KeyboardEvent.isComposing`
 * covers the standard case; Safari additionally fires the Enter that closes a
 * composition with `keyCode === 229`, so both must be treated as IME input.
 */
export interface ComposerEnterEvent {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

export function shouldSendOnEnter(event: ComposerEnterEvent): boolean {
  if (event.key !== "Enter" || event.shiftKey) return false;
  if (event.isComposing) return false;
  if (event.keyCode === 229) return false;
  return true;
}
