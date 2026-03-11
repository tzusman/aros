import { StageCard } from "./stage-card";
import type { PipelineCounts } from "@/lib/api/types";

interface StageCardsProps {
  counts: PipelineCounts;
  selectedStage: string;
  onSelect: (stage: string) => void;
}

export function StageCards({ counts, selectedStage, onSelect }: StageCardsProps) {
  const cards = [
    { key: "in_progress", label: "In Progress", count: counts.in_progress, color: "bg-stage-objective", subtitle: "objective + subjective" },
    { key: "pending_human", label: "Pending Human", count: counts.pending_human, color: "bg-stage-human" },
    { key: "awaiting_revisions", label: "Awaiting Revisions", count: counts.awaiting_revisions, color: "bg-stage-revising" },
    { key: "approved_72h", label: "Approved", count: counts.approved_72h, color: "bg-stage-approved", subtitle: "last 72h" },
    { key: "rejected_72h", label: "Rejected", count: counts.rejected_72h, color: "bg-stage-rejected", subtitle: "last 72h" },
  ];

  return (
    <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Pipeline stages">
      {cards.map((card) => (
        <StageCard
          key={card.key}
          {...card}
          isSelected={selectedStage === card.key}
          onClick={() => onSelect(card.key)}
        />
      ))}
    </div>
  );
}
