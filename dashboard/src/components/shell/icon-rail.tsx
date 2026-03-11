import { FileText, Activity, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navItems = [
  { path: "/review", icon: FileText, label: "Review" },
  { path: "/pipeline", icon: Activity, label: "Pipeline" },
  { path: "/policies", icon: Settings, label: "Policies" },
] as const;

export function IconRail() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      {/* Desktop: vertical icon rail */}
      <TooltipProvider delayDuration={300}>
        <nav
          className="hidden md:flex w-rail flex-col items-center pt-3 gap-1 border-r border-border bg-background shrink-0"
          aria-label="Main navigation"
        >
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname.startsWith(path);
            return (
              <Tooltip key={path}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate(path)}
                    className={cn(
                      "w-9 h-9 flex items-center justify-center rounded-lg transition-colors cursor-pointer",
                      isActive
                        ? "bg-surface border border-active"
                        : "hover:bg-surface"
                    )}
                    aria-label={label}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon
                      className={cn(
                        "w-[18px] h-[18px]",
                        isActive ? "text-active" : "text-text-muted"
                      )}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </TooltipProvider>

      {/* Mobile: bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-14 bg-background border-t border-border flex items-center justify-around px-4"
        aria-label="Main navigation"
      >
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname.startsWith(path);
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-1 px-3 cursor-pointer",
                isActive ? "text-active" : "text-text-muted"
              )}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[9px]">{label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
