import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeliverableFile } from "@/lib/api/types";

interface FileTabsProps {
  files: DeliverableFile[];
  activeFile: string | null;
  onSelect: (filename: string) => void;
}

export function FileTabs({ files, activeFile, onSelect }: FileTabsProps) {
  return (
    <div className="border-b border-border overflow-x-auto">
      <div className="flex px-2 min-w-max">
        {files.map((file) => (
          <button
            key={file.filename}
            onClick={() => onSelect(file.filename)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[11px] border-b-2 whitespace-nowrap transition-colors cursor-pointer",
              activeFile === file.filename
                ? "border-active text-active"
                : "border-transparent text-text-muted hover:text-text-secondary"
            )}
          >
            {file.status === "passed" ? (
              <CheckCircle2 className="w-3 h-3 text-stage-approved" />
            ) : file.status === "failed" ? (
              <XCircle className="w-3 h-3 text-stage-rejected" />
            ) : null}
            {file.filename}
          </button>
        ))}
      </div>
    </div>
  );
}
