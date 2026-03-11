import { ScrollArea } from "@/components/ui/scroll-area";
import { ScoreBadge } from "./score-badge";
import type { SubjectiveCriterion } from "@/lib/api/types";

export function SubjectiveTab({
  criteria,
  overallScore,
}: {
  criteria: SubjectiveCriterion[] | null;
  overallScore: number | null;
}) {
  if (!criteria) {
    return (
      <p className="p-3 text-xs text-text-muted">
        Subjective review not yet run.
      </p>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-3">
        {overallScore !== null && (
          <div className="flex justify-between items-center py-1.5 mb-2 border-b border-border">
            <span className="text-[11px] text-text-primary font-semibold">
              Overall
            </span>
            <ScoreBadge score={overallScore} size="md" />
          </div>
        )}

        {criteria.map((c, i) => (
          <div key={i} className="py-1.5 border-b border-border last:border-0">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] text-text-secondary">
                {c.name}
              </span>
              <ScoreBadge score={c.score} />
            </div>
            {c.rationale && (
              <p className="text-[9px] text-text-muted leading-relaxed mt-1 bg-surface p-2 rounded">
                {c.rationale}
              </p>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
