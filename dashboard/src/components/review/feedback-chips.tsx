import { cn } from "@/lib/utils";
import type { FeedbackChip } from "@/lib/api/types";

export interface SelectedChip {
  category: string;
  label: string;
  severity: "critical" | "major" | "minor";
}

interface FeedbackChipsProps {
  chips: FeedbackChip[];
  selected: SelectedChip[];
  onToggle: (chip: FeedbackChip) => void;
  disabled?: boolean;
}

const severityColors: Record<string, string> = {
  critical: "border-stage-rejected/40 text-stage-rejected bg-stage-rejected/5 hover:bg-stage-rejected/10",
  major: "border-stage-revising/40 text-stage-revising bg-stage-revising/5 hover:bg-stage-revising/10",
  minor: "border-text-muted/30 text-text-secondary bg-surface hover:bg-surface/80",
};

const severityColorsSelected: Record<string, string> = {
  critical: "border-stage-rejected bg-stage-rejected/20 text-stage-rejected",
  major: "border-stage-revising bg-stage-revising/20 text-stage-revising",
  minor: "border-text-muted bg-text-muted/10 text-text-primary",
};

export function FeedbackChips({ chips, selected, onToggle, disabled }: FeedbackChipsProps) {
  if (chips.length === 0) return null;
  const selectedCategories = new Set(selected.map((s) => s.category));

  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => {
        const isSelected = selectedCategories.has(chip.category);
        return (
          <button
            key={chip.category}
            onClick={() => onToggle(chip)}
            disabled={disabled}
            className={cn(
              "px-2 py-0.5 rounded-full border text-[10px] font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-default",
              isSelected ? severityColorsSelected[chip.severity] : severityColors[chip.severity]
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
