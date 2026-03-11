import { cn } from "@/lib/utils";
import { ScoreBadge } from "@/components/review/score-badge";
import type { DeliverableFile } from "@/lib/api/types";

interface ImageCardProps {
  file: DeliverableFile;
  isInspecting: boolean;
  onClick: () => void;
}

export function ImageCard({ file, isInspecting, onClick }: ImageCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "bg-surface rounded-xl overflow-hidden text-left transition-all cursor-pointer",
        isInspecting
          ? "ring-2 ring-active shadow-lg shadow-active/10"
          : "ring-1 ring-border hover:ring-text-muted"
      )}
    >
      <div className="aspect-video bg-gradient-to-br from-surface to-border flex items-center justify-center overflow-hidden">
        {file.preview_url ? (
          <img
            src={file.preview_url}
            alt={file.filename}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-lg font-bold text-text-muted">
            {file.filename.replace(/\.[^.]+$/, "").toUpperCase()}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <div className="flex justify-between items-center mb-0.5">
          <span className="text-[11px] text-text-primary font-medium truncate mr-2">
            {file.filename}
          </span>
          <ScoreBadge score={file.score} />
        </div>
        <span className="text-[9px] text-text-muted">
          {file.content_type}
          {file.status === "passed" && " · Passed"}
          {file.status === "failed" && " · Failed"}
        </span>
      </div>
    </button>
  );
}
