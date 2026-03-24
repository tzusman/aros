import { useState, useRef, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Grid2x2,
  Check,
  Ban,
  MessageSquare,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";
import type { Deliverable, DeliverableFile } from "@/lib/api/types";
import type { FileAnnotations, FileVerdict } from "@/pages/review-page";

interface MediaViewerProps {
  deliverable: Deliverable;
  inspectedFile: string | null;
  onInspect: (filename: string | null) => void;
  annotations: FileAnnotations;
  onSetVerdict: (filename: string, verdict: FileVerdict | null) => void;
  onSetNote: (filename: string, note: string) => void;
}

export function MediaViewer({
  deliverable,
  inspectedFile,
  onInspect,
  annotations,
  onSetVerdict,
  onSetNote,
}: MediaViewerProps) {
  const isMediaFolder =
    deliverable.is_folder &&
    deliverable.files?.some(
      (f) =>
        f.content_type.startsWith("image/") ||
        f.content_type.startsWith("video/")
    );

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
        annotations={annotations}
        onSetVerdict={onSetVerdict}
        onSetNote={onSetNote}
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

/* ── Per-file action buttons ── */

function FileActions({
  filename,
  annotations,
  onSetVerdict,
  onSetNote,
  layout,
}: {
  filename: string;
  annotations: FileAnnotations;
  onSetVerdict: (filename: string, verdict: FileVerdict | null) => void;
  onSetNote: (filename: string, note: string) => void;
  layout: "overlay" | "inline";
}) {
  const [showNote, setShowNote] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ann = annotations[filename];
  const verdict = ann?.verdict ?? null;
  const note = ann?.note ?? "";

  useEffect(() => {
    if (showNote) inputRef.current?.focus();
  }, [showNote]);

  const btnBase =
    layout === "overlay"
      ? "w-8 h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-sm"
      : "w-7 h-7 rounded-full flex items-center justify-center transition-all";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5",
        layout === "overlay" ? "absolute bottom-2 right-2 z-10" : ""
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Note input popover */}
      {showNote && (
        <div
          className={cn(
            "flex items-center gap-1 bg-background border border-border rounded-lg shadow-lg p-1",
            layout === "overlay" ? "absolute bottom-10 right-0 w-56" : "absolute bottom-9 right-0 w-52"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            value={note}
            onChange={(e) => onSetNote(filename, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setShowNote(false);
              if (e.key === "Escape") setShowNote(false);
            }}
            placeholder="Add a note..."
            className="flex-1 text-xs bg-transparent outline-none px-2 py-1 text-text-primary placeholder:text-text-muted"
          />
          <button
            onClick={() => setShowNote(false)}
            className="w-5 h-5 flex items-center justify-center rounded text-text-muted hover:text-text-secondary cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="flex gap-1">
        {/* Approve */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSetVerdict(filename, verdict === "approved" ? null : "approved");
          }}
          className={cn(
            btnBase,
            "cursor-pointer",
            verdict === "approved"
              ? "bg-stage-approved text-white shadow-md"
              : layout === "overlay"
                ? "bg-black/40 text-white/80 hover:bg-stage-approved/80 hover:text-white"
                : "bg-surface text-text-muted hover:bg-stage-approved/20 hover:text-stage-approved"
          )}
          aria-label="Approve file"
        >
          <Check className={layout === "overlay" ? "w-4 h-4" : "w-3.5 h-3.5"} />
        </button>

        {/* Disqualify */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSetVerdict(filename, verdict === "disqualified" ? null : "disqualified");
          }}
          className={cn(
            btnBase,
            "cursor-pointer",
            verdict === "disqualified"
              ? "bg-stage-rejected text-white shadow-md"
              : layout === "overlay"
                ? "bg-black/40 text-white/80 hover:bg-stage-rejected/80 hover:text-white"
                : "bg-surface text-text-muted hover:bg-stage-rejected/20 hover:text-stage-rejected"
          )}
          aria-label="Disqualify file"
        >
          <Ban className={layout === "overlay" ? "w-4 h-4" : "w-3.5 h-3.5"} />
        </button>

        {/* Note */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowNote(!showNote);
          }}
          className={cn(
            btnBase,
            "cursor-pointer",
            note.trim()
              ? "bg-active text-white shadow-md"
              : layout === "overlay"
                ? "bg-black/40 text-white/80 hover:bg-active/80 hover:text-white"
                : "bg-surface text-text-muted hover:bg-active/20 hover:text-active"
          )}
          aria-label="Add note"
        >
          <MessageSquare className={layout === "overlay" ? "w-4 h-4" : "w-3.5 h-3.5"} />
        </button>
      </div>
    </div>
  );
}

/* ── Media folder: grid + single view ── */

function MediaFolderViewer({
  files,
  inspectedFile,
  onInspect,
  annotations,
  onSetVerdict,
  onSetNote,
}: {
  files: DeliverableFile[];
  inspectedFile: string | null;
  onInspect: (filename: string | null) => void;
  annotations: FileAnnotations;
  onSetVerdict: (filename: string, verdict: FileVerdict | null) => void;
  onSetNote: (filename: string, note: string) => void;
}) {
  const [mode, setMode] = useState<"grid" | "single">(
    inspectedFile ? "single" : "grid"
  );

  const mediaFiles = files.filter(
    (f) =>
      f.content_type.startsWith("image/") ||
      f.content_type.startsWith("video/")
  );

  if (mode === "single" || inspectedFile) {
    const currentName = inspectedFile || mediaFiles[0]?.filename;
    const idx = mediaFiles.findIndex((f) => f.filename === currentName);
    const file = mediaFiles[idx];
    if (!file) return null;

    const ann = annotations[file.filename];
    const verdict = ann?.verdict ?? null;
    const note = ann?.note ?? "";

    return (
      <div className="h-full flex flex-col">
        {/* Toolbar */}
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

          <div className="flex items-center gap-2">
            {/* Verdict indicator */}
            {verdict && (
              <span
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full",
                  verdict === "approved"
                    ? "bg-stage-approved/15 text-stage-approved"
                    : "bg-stage-rejected/15 text-stage-rejected"
                )}
              >
                {verdict === "approved" ? "Kept" : "Cut"}
              </span>
            )}
            {note && (
              <span className="text-[10px] text-active truncate max-w-[20ch]">
                "{note}"
              </span>
            )}
            <span className="text-[10px] text-text-secondary font-medium">
              {file.filename}
            </span>
            <span className="text-[10px] text-text-muted">
              {idx + 1}/{mediaFiles.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Per-file actions */}
            <FileActions
              filename={file.filename}
              annotations={annotations}
              onSetVerdict={onSetVerdict}
              onSetNote={onSetNote}
              layout="inline"
            />

            <div className="w-px h-4 bg-border" />

            {/* Navigation */}
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
        </div>

        {/* Full-bleed media */}
        <div
          className={cn(
            "flex-1 flex items-center justify-center p-4 min-h-0 transition-opacity",
            verdict === "disqualified" && "opacity-30"
          )}
        >
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

  // ── Grid view ──
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {mediaFiles.map((file) => {
          const ann = annotations[file.filename];
          const verdict = ann?.verdict ?? null;
          const note = ann?.note ?? "";

          return (
            <div
              key={file.filename}
              className={cn(
                "group relative aspect-video rounded-lg overflow-hidden bg-surface transition-all",
                verdict === "approved"
                  ? "ring-2 ring-stage-approved shadow-md shadow-stage-approved/10"
                  : verdict === "disqualified"
                    ? "ring-2 ring-stage-rejected"
                    : "ring-1 ring-border hover:ring-text-muted"
              )}
            >
              {/* Clickable image area */}
              <button
                onClick={() => {
                  onInspect(file.filename);
                  setMode("single");
                }}
                className={cn(
                  "w-full h-full cursor-pointer transition-opacity",
                  verdict === "disqualified" && "opacity-25"
                )}
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
              </button>

              {/* Verdict badge - top left */}
              {verdict && (
                <div
                  className={cn(
                    "absolute top-1.5 left-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white z-10",
                    verdict === "approved"
                      ? "bg-stage-approved"
                      : "bg-stage-rejected"
                  )}
                >
                  {verdict === "approved" ? "Kept" : "Cut"}
                </div>
              )}

              {/* Note indicator - below verdict */}
              {note.trim() && (
                <div className="absolute top-1.5 left-1.5 z-10" style={{ marginTop: verdict ? "22px" : 0 }}>
                  <div className="bg-active text-white text-[8px] px-1.5 py-0.5 rounded-full max-w-[12ch] truncate">
                    {note}
                  </div>
                </div>
              )}

              {/* Score pill - top right */}
              {file.score !== null && (
                <div
                  className={cn(
                    "absolute top-1.5 right-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full z-10",
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

              {/* Filename label */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 pointer-events-none">
                <span className="text-[10px] text-white/90 truncate block">
                  {file.filename}
                </span>
              </div>

              {/* Action buttons - appear on hover */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <FileActions
                  filename={file.filename}
                  annotations={annotations}
                  onSetVerdict={onSetVerdict}
                  onSetNote={onSetNote}
                  layout="overlay"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
