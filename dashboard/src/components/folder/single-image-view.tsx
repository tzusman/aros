import { ChevronLeft, ChevronRight, Grid2x2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DeliverableFile } from "@/lib/api/types";

interface SingleImageViewProps {
  files: DeliverableFile[];
  currentFile: string;
  onSelect: (filename: string) => void;
  onBack: () => void;
}

export function SingleImageView({
  files,
  currentFile,
  onSelect,
  onBack,
}: SingleImageViewProps) {
  const idx = files.findIndex((f) => f.filename === currentFile);
  if (idx < 0) return null;
  const file = files[idx];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="text-xs cursor-pointer"
        >
          <Grid2x2 className="w-3 h-3 mr-1" /> Grid
        </Button>
        <span className="text-xs text-text-primary font-medium">
          {file?.filename} ({idx + 1}/{files.length})
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={idx <= 0}
            onClick={() => onSelect(files[idx - 1].filename)}
            className="cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={idx >= files.length - 1}
            onClick={() => onSelect(files[idx + 1].filename)}
            className="cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl aspect-video bg-gradient-to-br from-surface to-border rounded-xl flex items-center justify-center shadow-lg">
          <span className="text-3xl font-bold text-text-muted">
            {file?.filename.replace(/\.[^.]+$/, "").toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}
