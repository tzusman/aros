import type { Policy } from "@/lib/api/types";

export function PipelineFlow({ policy }: { policy: Policy }) {
  const stages = [
    {
      label: "1. Objective",
      color: "text-stage-objective",
      detail: `${policy.objective.checks.length} checks`,
    },
    {
      label: "2. Subjective",
      color: "text-stage-subjective",
      detail: `${policy.subjective.criteria.length} criteria · threshold ${policy.subjective.pass_threshold}`,
    },
    {
      label: "3. Human",
      color: "text-stage-human",
      detail: `${policy.human.required_reviewers} reviewer · ${policy.human.sla_hours}h SLA`,
    },
  ];

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
