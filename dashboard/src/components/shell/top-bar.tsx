import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "@/lib/hooks/use-theme";
import type { ConnectionStatus } from "@/lib/api/types";

const connectionStyles: Record<
  ConnectionStatus,
  { dot: string; label: string }
> = {
  connected: { dot: "bg-stage-approved", label: "Connected" },
  reconnecting: { dot: "bg-stage-human", label: "Reconnecting" },
  disconnected: { dot: "bg-stage-rejected", label: "Disconnected" },
};

interface TopBarProps {
  connectionStatus: ConnectionStatus;
  onRetry?: () => void;
}

export function TopBar({ connectionStatus, onRetry }: TopBarProps) {
  const { theme, setTheme } = useTheme();
  const conn = connectionStyles[connectionStatus];

  function cycleTheme() {
    const next =
      theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
    setTheme(next);
  }

  const ThemeIcon =
    theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <header className="h-topbar flex items-center justify-between border-b border-border px-4 bg-background shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-text-primary tracking-tight">
          AROS
        </span>
        <div className="w-px h-5 bg-border" />
        <span className="text-xs text-text-muted hidden sm:inline">
          Agent Review Orchestration
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <div className={`w-1.5 h-1.5 rounded-full ${conn.dot}`} />
          <span>{conn.label}</span>
          {connectionStatus === "disconnected" && onRetry && (
            <button
              onClick={onRetry}
              className="text-active underline ml-1 cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>

        <button
          onClick={cycleTheme}
          className="p-1.5 rounded-md hover:bg-surface transition-colors cursor-pointer"
          aria-label={`Theme: ${theme}. Click to change.`}
        >
          <ThemeIcon className="w-4 h-4 text-text-secondary" />
        </button>
      </div>
    </header>
  );
}
