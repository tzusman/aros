import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  Brain,
  User,
} from "lucide-react";
import type { Policy, PolicyHumanConfig } from "@/lib/api/types";

const stageConfig: Record<
  string,
  { icon: typeof ShieldCheck; color: string; bg: string; border: string }
> = {
  objective: {
    icon: ShieldCheck,
    color: "text-stage-objective",
    bg: "bg-stage-objective/10",
    border: "border-stage-objective/30",
  },
  subjective: {
    icon: Brain,
    color: "text-stage-subjective",
    bg: "bg-stage-subjective/10",
    border: "border-stage-subjective/30",
  },
  human: {
    icon: User,
    color: "text-stage-human",
    bg: "bg-stage-human/10",
    border: "border-stage-human/30",
  },
};

export function PipelineFlow({ policy }: { policy: Policy }) {
  const stages: {
    key: string;
    label: string;
    detail: string;
    count: number;
  }[] = [];

  if (policy.objective) {
    stages.push({
      key: "objective",
      label: "Objective",
      detail: `${policy.objective.checks.length} checks`,
      count: policy.objective.checks.length,
    });
  }

  if (policy.subjective) {
    stages.push({
      key: "subjective",
      label: "Subjective",
      detail: `${policy.subjective.criteria.length} criteria`,
      count: policy.subjective.criteria.length,
    });
  }

  if (policy.human) {
    const isRich = "assignment_strategy" in policy.human;
    const human = policy.human as PolicyHumanConfig;
    stages.push({
      key: "human",
      label: "Human",
      detail: isRich
        ? `${human.required_reviewers} reviewer${human.required_reviewers > 1 ? "s" : ""}`
        : "Required",
      count: isRich ? human.required_reviewers : 1,
    });
  }

  return (
    <div className="flex items-center gap-0">
      {stages.map((stage, i) => {
        const config = stageConfig[stage.key];
        const Icon = config?.icon ?? ShieldCheck;
        const delay = `${i * 80}ms`;

        return (
          <div
            key={stage.key}
            className="flex items-center animate-fade-in-up"
            style={{ animationDelay: delay }}
          >
            <div
              className={cn(
                "relative flex items-center gap-2.5 rounded-xl px-4 py-3 border transition-shadow hover:shadow-md",
                config?.bg,
                config?.border
              )}
            >
              {/* Icon with count badge */}
              <div className="relative">
                <div
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center",
                    config?.bg
                  )}
                >
                  <Icon className={cn("w-4.5 h-4.5", config?.color)} />
                </div>
                {stage.count > 0 && (
                  <div
                    className={cn(
                      "absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white",
                      stage.key === "objective"
                        ? "bg-stage-objective"
                        : stage.key === "subjective"
                          ? "bg-stage-subjective"
                          : "bg-stage-human"
                    )}
                  >
                    {stage.count}
                  </div>
                )}
              </div>

              <div>
                <div
                  className={cn(
                    "text-[11px] font-semibold leading-tight",
                    config?.color
                  )}
                >
                  {stage.label}
                </div>
                <div className="text-[9px] text-text-muted mt-0.5">
                  {stage.detail}
                </div>
              </div>
            </div>

            {/* Animated connector arrow */}
            {i < stages.length - 1 && (
              <div className="flex items-center px-1.5">
                <svg width="28" height="12" viewBox="0 0 28 12" className="overflow-visible">
                  <line
                    x1="0"
                    y1="6"
                    x2="20"
                    y2="6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    className="text-border animate-flow-dash"
                  />
                  <polygon
                    points="18,2 26,6 18,10"
                    fill="currentColor"
                    className="text-border"
                  />
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
