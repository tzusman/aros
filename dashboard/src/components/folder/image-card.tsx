import { cn } from "@/lib/utils";
import { Maximize2 } from "lucide-react";
import { ScoreBadge } from "@/components/review/score-badge";
import type { DeliverableFile } from "@/lib/api/types";

interface ImageCardProps {
  file: DeliverableFile;
  isInspecting: boolean;
  onClick: () => void;
  selectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onExpand?: () => void;
}

export function ImageCard({
  file,
  isInspecting,
  onClick,
  selectable = false,
  isSelected = false,
  onToggleSelect,
  onExpand,
}: ImageCardProps) {
  const handleClick = () => {
    if (selectable && onToggleSelect) {
      onToggleSelect();
    } else {
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "bg-muted rounded-xl overflow-hidden text-left transition-all cursor-pointer",
        isSelected || isInspecting
          ? "ring-2 ring-primary shadow-lg shadow-primary/10"
          : "ring-1 ring-border hover:ring-text-muted"
      )}
    >
      <div className="aspect-video bg-gradient-to-br from-surface to-border flex items-center justify-center overflow-hidden relative">
        {file.preview_url ? (
          <img
            src={file.preview_url}
            alt={file.filename}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-lg font-bold text-muted-foreground">
            {file.filename.replace(/\.[^.]+$/, "").toUpperCase()}
          </span>
        )}
        {selectable && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExpand?.();
              }}
              className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-colors cursor-pointer"
              aria-label={`Expand ${file.filename}`}
            >
              <Maximize2 className="w-3 h-3 text-white" />
            </button>
            <div
              aria-hidden="true"
              className={cn(
                "absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all",
                isSelected
                  ? "bg-primary border-2 border-primary"
                  : "bg-black/20 border-2 border-white/40"
              )}
            >
              {isSelected && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </>
        )}
      </div>
      <div className="p-2.5">
        <div className="flex justify-between items-center mb-0.5">
          <span className="text-[11px] text-foreground font-medium truncate mr-2">
            {file.filename}
          </span>
          <ScoreBadge score={file.score} />
        </div>
        <span className="text-[9px] text-muted-foreground">
          {file.content_type}
          {file.status === "passed" && " · Passed"}
          {file.status === "failed" && " · Failed"}
        </span>
      </div>
    </div>
  );
}
