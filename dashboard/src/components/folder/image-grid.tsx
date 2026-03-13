import { useState } from "react";
import { Grid2x2, Square } from "lucide-react";
import { ImageCard } from "./image-card";
import { SingleImageView } from "./single-image-view";
import { cn } from "@/lib/utils";
import type { DeliverableFile, Deliverable } from "@/lib/api/types";

interface ImageGridProps {
  files: DeliverableFile[];
  onInspect: (filename: string) => void;
  inspectedFile: string | null;
  folderStrategy?: Deliverable["folder_strategy"];
  selectedFile?: string | null;
  onSelectFile?: (filename: string | null) => void;
}

export function ImageGrid({
  files,
  onInspect,
  inspectedFile,
  folderStrategy,
  selectedFile,
  onSelectFile,
}: ImageGridProps) {
  const [viewMode, setViewMode] = useState<"grid" | "single">("grid");
  const selectable = folderStrategy === "select";

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
              ? "bg-muted text-primary border border-primary/30"
              : "text-muted-foreground"
          )}
        >
          <Grid2x2 className="w-2.5 h-2.5" /> Grid
        </button>
        <button
          onClick={() => setViewMode("single")}
          className="text-[9px] px-2 py-1 rounded flex items-center gap-1 text-muted-foreground cursor-pointer hover:text-muted-foreground"
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
              selectable={selectable}
              isSelected={selectable && selectedFile === file.filename}
              onToggleSelect={() => {
                if (onSelectFile) {
                  onSelectFile(
                    selectedFile === file.filename ? null : file.filename
                  );
                }
              }}
              onExpand={() => {
                onInspect(file.filename);
                setViewMode("single");
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
