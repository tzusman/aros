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
    <TooltipProvider delayDuration={300}>
      <nav
        className="w-rail flex flex-col items-center pt-3 gap-1 border-r border-border bg-background shrink-0"
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
  );
}
