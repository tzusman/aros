import { useState } from "react";
import { ChevronLeft, ChevronRight, Grid2x2, Maximize2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";
import type { Deliverable, DeliverableFile } from "@/lib/api/types";

interface MediaViewerProps {
  deliverable: Deliverable;
  inspectedFile: string | null;
  onInspect: (filename: string | null) => void;
}

export function MediaViewer({
  deliverable,
  inspectedFile,
  onInspect,
}: MediaViewerProps) {
  const isImageFolder =
    deliverable.is_folder &&
    deliverable.files?.some((f) => f.content_type.startsWith("image/"));

  const isVideoFolder =
    deliverable.is_folder &&
    deliverable.files?.some((f) => f.content_type.startsWith("video/"));

  const isMediaFolder = isImageFolder || isVideoFolder;

  // Single media file (not a folder)
  const isSingleMedia =
    !deliverable.is_folder &&
    (deliverable.content_type?.startsWith("image/") ||
      deliverable.content_type?.startsWith("video/"));

  if (isMediaFolder && deliverable.files) {
    return (
      <MediaFolderViewer
        files={deliverable.files}
        inspectedFile={inspectedFile}
        onInspect={onInspect}
      />
    );
  }

  if (isSingleMedia && deliverable.files?.[0]) {
    const file = deliverable.files[0];
    return (
      <div className="h-full flex items-center justify-center p-4 bg-background">
        {file.content_type.startsWith("video/") ? (
          <video
            src={file.preview_url}
            controls
            className="max-w-full max-h-full rounded-lg"
          />
        ) : (
          <img
            src={file.preview_url}
            alt={file.filename}
            className="max-w-full max-h-full rounded-lg object-contain"
          />
        )}
      </div>
    );
  }

  // Fallback: markdown/text content
  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 max-w-3xl mx-auto">
        <article className="prose prose-sm dark:prose-invert prose-headings:text-text-primary prose-p:text-text-secondary prose-p:leading-relaxed max-w-none">
          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
            {deliverable.content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}

/* ── Media folder: grid + single view ── */

function MediaFolderViewer({
  files,
  inspectedFile,
  onInspect,
}: {
  files: DeliverableFile[];
  inspectedFile: string | null;
  onInspect: (filename: string | null) => void;
}) {
  const [mode, setMode] = useState<"grid" | "single">(
    inspectedFile ? "single" : "grid"
  );

  const mediaFiles = files.filter(
    (f) => f.content_type.startsWith("image/") || f.content_type.startsWith("video/")
  );

  if (mode === "single" || inspectedFile) {
    const currentName = inspectedFile || mediaFiles[0]?.filename;
    const idx = mediaFiles.findIndex((f) => f.filename === currentName);
    const file = mediaFiles[idx];
    if (!file) return null;

    return (
      <div className="h-full flex flex-col">
        {/* Thin toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
          <button
            onClick={() => {
              setMode("grid");
              onInspect(null);
            }}
            className="text-[10px] text-text-muted hover:text-text-secondary flex items-center gap-1 cursor-pointer"
          >
            <Grid2x2 className="w-3 h-3" /> Grid
          </button>
          <span className="text-[10px] text-text-secondary font-medium">
            {file.filename}
            <span className="text-text-muted ml-1.5">
              {idx + 1}/{mediaFiles.length}
            </span>
          </span>
          <div className="flex gap-0.5">
            <button
              disabled={idx <= 0}
              onClick={() => onInspect(mediaFiles[idx - 1].filename)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface disabled:opacity-20 cursor-pointer disabled:cursor-default"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-text-secondary" />
            </button>
            <button
              disabled={idx >= mediaFiles.length - 1}
              onClick={() => onInspect(mediaFiles[idx + 1].filename)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface disabled:opacity-20 cursor-pointer disabled:cursor-default"
            >
              <ChevronRight className="w-3.5 h-3.5 text-text-secondary" />
            </button>
          </div>
        </div>

        {/* Full-bleed media */}
        <div className="flex-1 flex items-center justify-center p-4 min-h-0">
          {file.content_type.startsWith("video/") ? (
            <video
              src={file.preview_url}
              controls
              className="max-w-full max-h-full rounded-lg"
            />
          ) : file.preview_url ? (
            <img
              src={file.preview_url}
              alt={file.filename}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          ) : (
            <div className="w-full max-w-2xl aspect-video bg-surface rounded-lg flex items-center justify-center">
              <span className="text-2xl font-bold text-text-muted">
                {file.filename.replace(/\.[^.]+$/, "").toUpperCase()}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {mediaFiles.map((file) => (
          <button
            key={file.filename}
            onClick={() => {
              onInspect(file.filename);
              setMode("single");
            }}
            className="group relative aspect-video rounded-lg overflow-hidden bg-surface ring-1 ring-border hover:ring-text-muted transition-all cursor-pointer"
          >
            {file.content_type.startsWith("video/") ? (
              <video
                src={file.preview_url}
                muted
                className="w-full h-full object-cover"
              />
            ) : file.preview_url ? (
              <img
                src={file.preview_url}
                alt={file.filename}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-sm font-bold text-text-muted">
                  {file.filename.replace(/\.[^.]+$/, "").toUpperCase()}
                </span>
              </div>
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            {/* Filename label */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
              <span className="text-[10px] text-white/90 truncate block">
                {file.filename}
              </span>
            </div>
            {/* Score pill */}
            {file.score !== null && (
              <div
                className={cn(
                  "absolute top-1.5 right-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full",
                  file.score >= 7
                    ? "bg-stage-approved/90 text-white"
                    : file.score >= 6
                      ? "bg-stage-human/90 text-black"
                      : "bg-stage-rejected/90 text-white"
                )}
              >
                {file.score.toFixed(1)}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
