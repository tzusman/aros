import { cn } from "@/lib/utils";

interface StageCardProps {
  label: string;
  count: number;
  color: string;
  subtitle?: string;
  isSelected: boolean;
  onClick: () => void;
}

export function StageCard({
  label,
  count,
  color,
  subtitle,
  isSelected,
  onClick,
}: StageCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 min-w-[120px] bg-surface rounded-lg p-3 text-left transition-colors cursor-pointer",
        isSelected ? "border border-active" : "border border-transparent"
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-2 h-2 rounded-sm ${color}`} />
        <span className="text-[10px] text-text-primary font-medium">
          {label}
        </span>
      </div>
      <div className="text-xl font-bold text-text-primary">{count}</div>
      {subtitle && (
        <div className="text-[8px] text-text-muted mt-0.5">{subtitle}</div>
      )}
    </button>
  );
}
