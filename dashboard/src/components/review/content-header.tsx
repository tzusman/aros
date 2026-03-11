import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "./score-badge";
import { cn } from "@/lib/utils";
import type { Deliverable } from "@/lib/api/types";

function scoreContainerClass(score: number | null): string {
  if (score === null) return "bg-surface text-text-muted";
  if (score >= 7) return "bg-stage-approved/10 text-stage-approved";
  if (score >= 6) return "bg-stage-human/10 text-stage-human";
  return "bg-stage-rejected/10 text-stage-rejected";
}

export function ContentHeader({
  deliverable,
}: {
  deliverable: Deliverable;
}) {
  return (
    <div className="px-5 py-3 border-b border-border shrink-0">
      <h1 className="text-sm font-semibold text-text-primary mb-1">
        {deliverable.title}
      </h1>
      <div className="flex items-center gap-2">
        <div className={cn("flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded", scoreContainerClass(deliverable.score))}>
          Score: <ScoreBadge score={deliverable.score} />
        </div>
        <span className="text-[10px] text-text-muted">
          Policy: {deliverable.policy}
        </span>
        {deliverable.revision_number > 1 && (
          <Badge variant="outline" className="text-[10px] h-4">
            v{deliverable.revision_number}
          </Badge>
        )}
        {deliverable.is_folder && (
          <Badge variant="outline" className="text-[10px] h-4 text-stage-subjective border-stage-subjective/30">
            Folder · {deliverable.file_count} files
          </Badge>
        )}
      </div>
    </div>
  );
}
