import { useState } from "react";
import { Grid2x2, Square } from "lucide-react";
import { ImageCard } from "./image-card";
import { SingleImageView } from "./single-image-view";
import { cn } from "@/lib/utils";
import type { DeliverableFile } from "@/lib/api/types";

interface ImageGridProps {
  files: DeliverableFile[];
  onInspect: (filename: string) => void;
  inspectedFile: string | null;
}

export function ImageGrid({ files, onInspect, inspectedFile }: ImageGridProps) {
  const [viewMode, setViewMode] = useState<"grid" | "single">("grid");

  if (viewMode === "single") {
    return (
      <SingleImageView
        files={files}
        currentFile={inspectedFile || files[0]?.filename}
        onSelect={(f) => onInspect(f)}
        onBack={() => setViewMode("grid")}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex justify-end px-4 pt-2 gap-1">
        <button
          onClick={() => setViewMode("grid")}
          className={cn(
            "text-[9px] px-2 py-1 rounded flex items-center gap-1 cursor-pointer",
            viewMode === "grid"
              ? "bg-surface text-active border border-active/30"
              : "text-text-muted"
          )}
        >
          <Grid2x2 className="w-2.5 h-2.5" /> Grid
        </button>
        <button
          onClick={() => setViewMode("single")}
          className="text-[9px] px-2 py-1 rounded flex items-center gap-1 text-text-muted cursor-pointer hover:text-text-secondary"
        >
          <Square className="w-2.5 h-2.5" /> Single
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          {files.map((file) => (
            <ImageCard
              key={file.filename}
              file={file}
              isInspecting={inspectedFile === file.filename}
              onClick={() => onInspect(file.filename)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
