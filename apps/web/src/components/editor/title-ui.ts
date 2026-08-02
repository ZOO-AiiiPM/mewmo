export type TitleSelectionMode = "select-all" | "caret-end";
export type TitleKeyAction = "allow" | "commit-and-focus-body";

export interface TitleKeyEvent {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
}

export function normalizeTitleText(value: string) {
  const title = value.replace(/\s+/g, " ").trim();
  return title || "Untitled";
}

export function getInitialTitleSelectionMode(title: string): TitleSelectionMode {
  return normalizeTitleText(title) === "Untitled" ? "select-all" : "caret-end";
}

/**
 * IME-aware title key decision. While a CJK input method is composing
 * (拼音候选未上屏), Enter confirms the candidate instead of committing and
 * moving focus into the body. `isComposing` covers the standard case; Safari
 * additionally fires the Enter that closes a composition with `keyCode === 229`,
 * so both must be treated as IME input and allowed through to the browser/IME.
 */
export function titleKeyAction(event: TitleKeyEvent): TitleKeyAction {
  if (event.key !== "Enter") return "allow";
  if (event.isComposing) return "allow";
  if (event.keyCode === 229) return "allow";
  return "commit-and-focus-body";
}
