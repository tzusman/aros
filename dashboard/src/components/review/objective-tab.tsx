import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ObjectiveCheck } from "@/lib/api/types";

const icons = {
  pass: <CheckCircle2 className="w-3.5 h-3.5 text-stage-approved" />,
  fail: <XCircle className="w-3.5 h-3.5 text-stage-rejected" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-stage-human" />,
};

export function ObjectiveTab({
  checks,
}: {
  checks: ObjectiveCheck[] | null;
}) {
  if (!checks) {
    return (
      <p className="p-3 text-xs text-text-muted">
        Objective checks not yet run.
      </p>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-1">
        {checks.map((check, i) => (
          <div
            key={i}
            className="flex items-start gap-2 py-1.5 border-b border-border last:border-0"
          >
            {check.passed
              ? icons.pass
              : check.severity === "warning"
                ? icons.warning
                : icons.fail}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-text-primary font-medium">
                {check.name}
              </div>
              {check.details && (
                <div className="text-[10px] text-text-muted mt-0.5">
                  {check.details}
                </div>
              )}
            </div>
            <span className="text-[9px] text-text-muted shrink-0">
              {check.severity}
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
