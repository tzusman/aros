import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ObjectiveCheck } from "@/lib/api/types";

interface BriefTabProps {
  brief: string;
  objectiveResults?: ObjectiveCheck[] | null;
  onTabChange?: (tab: string) => void;
}

export function BriefTab({ brief, objectiveResults, onTabChange }: BriefTabProps) {
  const passed = objectiveResults?.filter((c) => c.passed).length ?? 0;
  const warnings = objectiveResults?.filter((c) => !c.passed && c.severity === "warning").length ?? 0;
  const blocking = objectiveResults?.filter((c) => !c.passed && c.severity === "blocking").length ?? 0;

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
        {brief}
      </div>
      {objectiveResults && objectiveResults.length > 0 && (
        <div className="px-3 pb-3">
          <div className="border-t border-border pt-2">
            <div className="text-[10px] font-semibold text-foreground mb-1.5">
              Quick Checks
            </div>
            <div className="space-y-1">
              {objectiveResults.map((check, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px]">
                  {check.passed ? (
                    <CheckCircle2 className="w-3 h-3 text-stage-approved shrink-0" />
                  ) : check.severity === "warning" ? (
                    <AlertTriangle className="w-3 h-3 text-stage-human shrink-0" />
                  ) : (
                    <XCircle className="w-3 h-3 text-stage-rejected shrink-0" />
                  )}
                  <span
                    className={
                      check.passed
                        ? "text-muted-foreground"
                        : check.severity === "warning"
                          ? "text-stage-human"
                          : "text-stage-rejected"
                    }
                  >
                    {check.name}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 text-[9px] text-muted-foreground">
              {passed} passed
              {warnings > 0 && ` · ${warnings} warning${warnings > 1 ? "s" : ""}`}
              {blocking > 0 && ` · ${blocking} failed`}
              {onTabChange && (
                <>
                  {" · "}
                  <button
                    onClick={() => onTabChange("objective")}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    View details
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </ScrollArea>
  );
}
