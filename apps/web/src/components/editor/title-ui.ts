export type TitleSelectionMode = "select-all" | "caret-end";
export type TitleKeyAction = "allow" | "commit-and-focus-body";

export function normalizeTitleText(value: string) {
  const title = value.replace(/\s+/g, " ").trim();
  return title || "Untitled";
}

export function getInitialTitleSelectionMode(title: string): TitleSelectionMode {
  return normalizeTitleText(title) === "Untitled" ? "select-all" : "caret-end";
}

export function titleKeyAction(key: string): TitleKeyAction {
  return key === "Enter" ? "commit-and-focus-body" : "allow";
}
