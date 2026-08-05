import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/use-theme";

export function ThemeToggle({
  className = "",
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      title={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      className={`inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {showLabel && <span>{isDark ? "Modo claro" : "Modo escuro"}</span>}
    </button>
  );
}
