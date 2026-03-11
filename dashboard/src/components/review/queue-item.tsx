import { cn } from "@/lib/utils";
import { ScoreBadge } from "./score-badge";
import { useRelativeTime } from "@/lib/hooks/use-relative-time";
import type { DeliverableSummary } from "@/lib/api/types";

interface QueueItemProps {
  item: DeliverableSummary;
  isSelected: boolean;
  onClick: () => void;
}

export function QueueItem({ item, isSelected, onClick }: QueueItemProps) {
  const timeInQueue = useRelativeTime(item.entered_stage_at);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg p-2.5 mb-1 transition-colors cursor-pointer",
        isSelected
          ? "bg-surface border-l-[3px] border-l-active"
          : "border-l-[3px] border-l-transparent hover:bg-surface/50"
      )}
    >
      <div className="flex justify-between items-start mb-1">
        <span
          className={cn(
            "text-[11px] font-medium truncate mr-2",
            isSelected ? "text-text-primary" : "text-text-secondary"
          )}
        >
          {item.title}
        </span>
        <ScoreBadge score={item.score} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-text-muted truncate">
          {item.source_agent}
        </span>
        <span className="w-0.5 h-0.5 rounded-full bg-text-muted" />
        <span className="text-[9px] text-text-muted">{timeInQueue}</span>
        {item.is_folder && (
          <>
            <span className="w-0.5 h-0.5 rounded-full bg-text-muted" />
            <span className="text-[9px] px-1 py-px bg-stage-subjective/15 text-stage-subjective rounded">
              folder · {item.file_count} files
            </span>
          </>
        )}
      </div>
    </button>
  );
}
