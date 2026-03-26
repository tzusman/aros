import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import type { Deliverable } from "@/lib/api/types";

interface DecisionSummaryProps {
  deliverable: Deliverable;
}

function computeRecommendation(deliverable: Deliverable): {
  decision: "approve" | "revise" | "review";
  reason: string;
} {
  const score = deliverable.score;
  const checks = deliverable.objective_results ?? [];
  const criteria = deliverable.subjective_results ?? [];

  const blockingFails = checks.filter((c) => !c.passed && c.severity === "blocking");
  const warnings = checks.filter((c) => !c.passed && c.severity === "warning");

  if (blockingFails.length > 0) {
    return { decision: "revise", reason: `${blockingFails.length} blocking check(s) failed` };
  }
  if (score !== null && score < 5.0) {
    return { decision: "revise", reason: "Score well below threshold" };
  }
  if (score !== null && score >= 7.5 && warnings.length === 0) {
    return { decision: "approve", reason: "Strong scores, all checks pass" };
  }

  const weakest = criteria.length > 0
    ? criteria.reduce((a, b) => (a.score / a.scale < b.score / b.scale ? a : b))
    : null;

  if (weakest && weakest.score / weakest.scale < 0.5) {
    return { decision: "revise", reason: `${weakest.name} scored ${weakest.score}/${weakest.scale}` };
  }

  return { decision: "review", reason: "Scores are mixed — needs careful review" };
}

export function DecisionSummary({ deliverable }: DecisionSummaryProps) {
  const checks = deliverable.objective_results ?? [];
  const criteria = deliverable.subjective_results ?? [];

  if (checks.length === 0 && criteria.length === 0 && deliverable.score === null) {
    return null;
  }

  const recommendation = computeRecommendation(deliverable);
  const failingChecks = checks.filter((c) => !c.passed);
  const warnings = checks.filter((c) => !c.passed && c.severity === "warning");
  const blocking = checks.filter((c) => !c.passed && c.severity === "blocking");
  const passing = checks.filter((c) => c.passed);

  const weakest = criteria.length > 0
    ? criteria.reduce((a, b) => (a.score / a.scale < b.score / b.scale ? a : b))
    : null;

  const recColor =
    recommendation.decision === "approve" ? "text-stage-approved"
    : recommendation.decision === "revise" ? "text-stage-revising"
    : "text-text-secondary";

  const recBg =
    recommendation.decision === "approve" ? "bg-stage-approved/5 border-stage-approved/20"
    : recommendation.decision === "revise" ? "bg-stage-revising/5 border-stage-revising/20"
    : "bg-surface border-border";

  const RecIcon = recommendation.decision === "approve" ? CheckCircle
    : recommendation.decision === "revise" ? AlertTriangle
    : Info;

  return (
    <div className={`mx-3 mt-2 mb-1 rounded-lg border px-3 py-2.5 ${recBg}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {deliverable.score !== null && (
            <span className="text-lg font-bold tabular-nums text-text-primary">
              {deliverable.score.toFixed(1)}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            {passing.length > 0 && (
              <span className="text-[10px] text-stage-approved">{passing.length} passed</span>
            )}
            {warnings.length > 0 && (
              <span className="text-[10px] text-stage-human">{warnings.length} warning</span>
            )}
            {blocking.length > 0 && (
              <span className="text-[10px] text-stage-rejected">{blocking.length} failed</span>
            )}
          </div>
        </div>
        <div className={`flex items-center gap-1 text-[11px] font-medium ${recColor}`}>
          <RecIcon className="w-3 h-3" />
          <span>
            {recommendation.decision === "approve" ? "Looks good"
            : recommendation.decision === "revise" ? "Needs work"
            : "Review carefully"}
          </span>
        </div>
      </div>

      {failingChecks.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {failingChecks.map((c) => (
            <span key={c.name} className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              c.severity === "blocking"
                ? "bg-stage-rejected/10 text-stage-rejected"
                : "bg-stage-human/10 text-stage-human"
            }`}>
              {c.severity === "blocking" ? "!" : "~"} {c.name}: {c.details.slice(0, 60)}
            </span>
          ))}
        </div>
      )}

      {weakest && weakest.score / weakest.scale < 0.7 && (
        <div className="mt-1.5 text-[10px] text-text-secondary leading-relaxed">
          <span className="font-medium">{weakest.name}</span>{" "}
          <span className="tabular-nums">({weakest.score}/{weakest.scale})</span>
          {weakest.rationale && (
            <span className="text-text-muted"> — {weakest.rationale.slice(0, 120)}</span>
          )}
        </div>
      )}
    </div>
  );
}
