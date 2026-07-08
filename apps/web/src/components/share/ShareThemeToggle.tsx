"use client";

import { useTheme } from "../../lib/theme";
import { PrototypeIcon, type PrototypeIconName } from "../shell/PrototypeIcon";

const themeOptions: Array<{
  value: "system" | "dark" | "light";
  label: string;
  icon: PrototypeIconName;
}> = [
  { value: "system", label: "跟随系统", icon: "monitor" },
  { value: "dark", label: "深色模式", icon: "moon" },
  { value: "light", label: "浅色模式", icon: "sun" },
];

export function ShareThemeToggle() {
  const { theme, setTheme, resolved } = useTheme();

  return (
    <div className="mewmo-share-theme-toggle" role="group" aria-label="外观模式" data-resolved={resolved}>
      {themeOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          className={theme === option.value ? "is-active" : ""}
          aria-label={option.label}
          aria-pressed={theme === option.value}
          title={option.label}
          onClick={() => setTheme(option.value)}
        >
          <PrototypeIcon name={option.icon} size={16} />
        </button>
      ))}
    </div>
  );
}
