import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number | null;
  size?: "sm" | "md";
}

export function ScoreBadge({ score, size = "sm" }: ScoreBadgeProps) {
  if (score === null) return <span className="text-text-muted">—</span>;

  const color =
    score >= 7
      ? "text-stage-approved"
      : score >= 6
        ? "text-stage-human"
        : "text-stage-rejected";

  return (
    <span
      className={cn(
        "font-semibold",
        color,
        size === "sm" ? "text-xs" : "text-sm"
      )}
      aria-label={`Score: ${score.toFixed(1)}`}
    >
      {score.toFixed(1)}
    </span>
  );
}
