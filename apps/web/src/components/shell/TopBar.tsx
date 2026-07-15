interface TopBarProps {
  title: string;
  action?: { label: string; onClick?: () => void };
}

export function TopBar({ title, action }: TopBarProps) {
  return (
    <header className="h-14 flex items-center gap-4 px-6 border-b border-line bg-paper/80 backdrop-blur-xl sticky top-0 z-10">
      <h1 className="text-lg font-semibold text-ink">{title}</h1>

      <div className="flex-1" />

      {action && (
        <button
          onClick={action.onClick}
          className="px-3.5 py-1.5 rounded-md bg-moss text-white text-sm font-medium hover:bg-moss/90 transition-colors"
        >
          {action.label}
        </button>
      )}
    </header>
  );
}
