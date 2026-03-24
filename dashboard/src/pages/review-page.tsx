import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useApp } from "@/context/app-context";
import { useKeyboard } from "@/lib/hooks/use-keyboard";
import { useTheme } from "@/lib/hooks/use-theme";
import { DecisionBar } from "@/components/review/decision-bar";
import { MediaViewer } from "@/components/review/media-viewer";
import { ScoreBadge } from "@/components/review/score-badge";
import { ChevronLeft, ChevronRight, Moon, Sun, Monitor } from "lucide-react";

export type FileVerdict = "approved" | "disqualified";

export interface FileAnnotation {
  verdict: FileVerdict | null;
  note: string;
}

export type FileAnnotations = Record<string, FileAnnotation>;

export function ReviewPage() {
  const { id: routeId } = useParams<{ id: string }>();
  const { state, selectDeliverable } = useApp();
  const { theme, setTheme } = useTheme();
  const [inspectedFile, setInspectedFile] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<FileAnnotations>({});

  useEffect(() => {
    if (routeId && routeId !== state.selectedId) {
      selectDeliverable(routeId);
    }
  }, [routeId]);

  // Auto-select first queue item when nothing is selected
  useEffect(() => {
    if (!state.selectedId && state.queue.length > 0) {
      selectDeliverable(state.queue[0].id);
    }
  }, [state.queue, state.selectedId, selectDeliverable]);

  // Reset state when switching deliverables
  useEffect(() => {
    setInspectedFile(null);
    setAnnotations({});
  }, [state.selectedId]);

  const queueIndex = state.queue.findIndex((d) => d.id === state.selectedId);

  function goNext() {
    if (queueIndex < state.queue.length - 1) {
      selectDeliverable(state.queue[queueIndex + 1].id);
    }
  }

  function goPrev() {
    if (queueIndex > 0) {
      selectDeliverable(state.queue[queueIndex - 1].id);
    }
  }

  const setFileVerdict = useCallback(
    (filename: string, verdict: FileVerdict | null) => {
      setAnnotations((prev) => ({
        ...prev,
        [filename]: { ...prev[filename], verdict, note: prev[filename]?.note || "" },
      }));
    },
    []
  );

  const setFileNote = useCallback(
    (filename: string, note: string) => {
      setAnnotations((prev) => ({
        ...prev,
        [filename]: { ...prev[filename], verdict: prev[filename]?.verdict ?? null, note },
      }));
    },
    []
  );

  const keyMap = useMemo(
    () => ({
      j: goNext,
      k: goPrev,
    }),
    [state.queue, state.selectedId, selectDeliverable]
  );

  useKeyboard(keyMap);

  const deliverable = state.selectedDeliverable;
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  function cycleTheme() {
    const next = theme === "system" ? "dark" : theme === "dark" ? "light" : "system";
    setTheme(next);
  }

  const connDot =
    state.connectionStatus === "connected"
      ? "bg-stage-approved"
      : state.connectionStatus === "reconnecting"
        ? "bg-stage-human"
        : "bg-stage-rejected";

  // Annotation counts for the header
  const approvedCount = Object.values(annotations).filter((a) => a.verdict === "approved").length;
  const disqualifiedCount = Object.values(annotations).filter((a) => a.verdict === "disqualified").length;
  const notedCount = Object.values(annotations).filter((a) => a.note.trim()).length;
  const hasAnnotations = approvedCount > 0 || disqualifiedCount > 0 || notedCount > 0;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* ── Ultra-minimal nav bar ── */}
      <header className="h-10 flex items-center justify-between px-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <button
              onClick={goPrev}
              disabled={queueIndex <= 0}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface disabled:opacity-20 cursor-pointer disabled:cursor-default transition-opacity"
              aria-label="Previous"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-text-secondary" />
            </button>
            <span className="text-[10px] text-text-muted tabular-nums min-w-[3ch] text-center">
              {state.queue.length > 0
                ? `${queueIndex + 1}/${state.queue.length}`
                : "0"}
            </span>
            <button
              onClick={goNext}
              disabled={queueIndex >= state.queue.length - 1}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface disabled:opacity-20 cursor-pointer disabled:cursor-default transition-opacity"
              aria-label="Next"
            >
              <ChevronRight className="w-3.5 h-3.5 text-text-secondary" />
            </button>
          </div>

          {deliverable && (
            <>
              <div className="w-px h-4 bg-border" />
              <span className="text-xs font-medium text-text-primary truncate max-w-[30vw]">
                {deliverable.title}
              </span>
              {deliverable.revision_number > 1 && (
                <span className="text-[9px] text-text-muted">
                  v{deliverable.revision_number}
                </span>
              )}
            </>
          )}

          {/* Inline annotation tally */}
          {hasAnnotations && (
            <>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5 text-[10px]">
                {approvedCount > 0 && (
                  <span className="text-stage-approved font-medium">{approvedCount} kept</span>
                )}
                {disqualifiedCount > 0 && (
                  <span className="text-stage-rejected font-medium">{disqualifiedCount} cut</span>
                )}
                {notedCount > 0 && (
                  <span className="text-text-muted">{notedCount} noted</span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {deliverable && (
            <ScoreBadge score={deliverable.score} size="sm" />
          )}
          <div className={`w-1.5 h-1.5 rounded-full ${connDot}`} />
          <button
            onClick={cycleTheme}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface cursor-pointer transition-colors"
            aria-label={`Theme: ${theme}`}
          >
            <ThemeIcon className="w-3.5 h-3.5 text-text-muted" />
          </button>
        </div>
      </header>

      {/* ── Main content area ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {deliverable ? (
          <MediaViewer
            deliverable={deliverable}
            inspectedFile={inspectedFile}
            onInspect={setInspectedFile}
            annotations={annotations}
            onSetVerdict={setFileVerdict}
            onSetNote={setFileNote}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-text-muted">
              {state.loading ? "Loading..." : "No items to review"}
            </p>
          </div>
        )}
      </div>

      {/* ── Decision bar ── */}
      {deliverable && (
        <DecisionBar
          deliverableId={deliverable.id}
          brief={deliverable.brief}
          annotations={annotations}
        />
      )}
    </div>
  );
}
