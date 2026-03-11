import type { Policy, PolicyHumanConfig } from "@/lib/api/types";

export function PipelineFlow({ policy }: { policy: Policy }) {
  const stages: { label: string; color: string; detail: string }[] = [];

  if (policy.objective) {
    stages.push({
      label: `${stages.length + 1}. Objective`,
      color: "text-stage-objective",
      detail: `${policy.objective.checks.length} checks`,
    });
  }

  if (policy.subjective) {
    stages.push({
      label: `${stages.length + 1}. Subjective`,
      color: "text-stage-subjective",
      detail: `${policy.subjective.criteria.length} criteria · threshold ${policy.subjective.pass_threshold}`,
    });
  }

  if (policy.human) {
    const isRich = "assignment_strategy" in policy.human;
    const human = policy.human as PolicyHumanConfig;
    stages.push({
      label: `${stages.length + 1}. Human`,
      color: "text-stage-human",
      detail: isRich
        ? `${human.required_reviewers} reviewer · ${human.sla_hours}h SLA`
        : "Required",
    });
  }

  return (
    <div className="flex items-center gap-0">
      {stages.map((stage, i) => (
        <div key={stage.label} className="flex items-center">
          <div className="bg-surface rounded-lg px-4 py-2.5 border border-border">
            <div className={`text-[11px] font-semibold ${stage.color}`}>
              {stage.label}
            </div>
            <div className="text-[8px] text-text-muted mt-0.5">
              {stage.detail}
            </div>
          </div>
          {i < stages.length - 1 && (
            <span className="text-border px-1">&rarr;</span>
          )}
        </div>
      ))}
    </div>
  );
}
