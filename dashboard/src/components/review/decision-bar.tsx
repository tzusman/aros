import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api/client";
import { useApp } from "@/context/app-context";
import { toast } from "sonner";
import { Check, RotateCcw, X, MousePointer, CheckCircle2, XCircle, RotateCcw as Revise } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedbackChips, type SelectedChip } from "./feedback-chips";
import type { Decision, DecisionPayload, FeedbackChip } from "@/lib/api/types";
import type { FileAnnotations } from "@/pages/review-page";
import type { DecidedInfo } from "@/context/app-reducer";

interface DecisionBarProps {
  deliverableId: string;
  brief: string;
  annotations: FileAnnotations;
  folderStrategy?: string | null;
  selectedFile?: string | null;
  feedbackChips?: FeedbackChip[];
  decidedInfo?: DecidedInfo | null;
}

interface SubmittedState {
  decision: Decision;
  selectedFile: string | null;
  reason: string;
}

function serializeAnnotations(annotations: FileAnnotations): string {
  const lines: string[] = [];
  const entries = Object.entries(annotations).filter(
    ([, a]) => a.verdict || a.note.trim()
  );
  if (entries.length === 0) return "";

  for (const [filename, ann] of entries) {
    const parts: string[] = [];
    if (ann.verdict === "approved") parts.push("KEEP");
    if (ann.verdict === "disqualified") parts.push("CUT");
    if (ann.note.trim()) parts.push(ann.note.trim());
    lines.push(`- ${filename}: ${parts.join(" — ")}`);
  }
  return lines.join("\n");
}

export function DecisionBar({
  deliverableId,
  annotations,
  folderStrategy,
  selectedFile,
  feedbackChips = [],
  decidedInfo,
}: DecisionBarProps) {
  const { dispatch } = useApp();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmittedState | null>(null);
  const [selectedChips, setSelectedChips] = useState<SelectedChip[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isSelectMode = folderStrategy === "select";
  const hasReason = reason.trim().length > 0;
  const canSubmitNegative = hasReason || selectedChips.length > 0;

  function toggleChip(chip: FeedbackChip) {
    setSelectedChips((prev) => {
      const exists = prev.find((c) => c.category === chip.category);
      if (exists) return prev.filter((c) => c.category !== chip.category);
      return [...prev, { category: chip.category, label: chip.label, severity: chip.severity }];
    });
  }

  // Reset form state when deliverable changes; restore decided state if navigating back
  useEffect(() => {
    if (decidedInfo) {
      setSubmitted({
        decision: decidedInfo.decision,
        selectedFile: decidedInfo.selectedFile,
        reason: decidedInfo.reason,
      });
    } else {
      setSubmitted(null);
    }
    setReason("");
    setSelectedChips([]);
  }, [deliverableId]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [reason]);

  async function submit(decision: Decision) {
    if (decision !== "approved" && !canSubmitNegative) return;
    setSubmitting(true);

    let fullReason: string | undefined;

    if (isSelectMode) {
      const parts: string[] = [];
      if (selectedFile) parts.push(`Selected: ${selectedFile}`);
      if (reason.trim()) parts.push(reason.trim());
      fullReason = parts.join("\n") || undefined;
    } else {
      const annotationBlock = serializeAnnotations(annotations);
      const parts = [reason.trim(), annotationBlock].filter(Boolean);
      fullReason = parts.join("\n\n") || undefined;
    }

    let issues: DecisionPayload["issues"] | undefined;
    if (selectedChips.length > 0) {
      issues = selectedChips.map((chip) => ({
        category: chip.category,
        description: chip.label,
        severity: chip.severity,
      }));
    }

    try {
      await api.submitDecision(deliverableId, {
        decision,
        reason: fullReason,
        issues,
      });

      const submittedState = {
        decision,
        selectedFile: selectedFile ?? null,
        reason: reason.trim(),
      };
      setSubmitted(submittedState);

      // Keep in queue for navigation — mark as decided
      dispatch({
        type: "MARK_DECIDED",
        id: deliverableId,
        info: { ...submittedState, annotations },
      });

      toast.success(
        decision === "approved"
          ? isSelectMode && selectedFile
            ? `Selected: ${selectedFile}`
            : "Approved"
          : decision === "revision_requested"
            ? "Revision requested"
            : "Rejected"
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error("Already decided by another reviewer");
        dispatch({ type: "REMOVE_FROM_QUEUE", id: deliverableId });
      } else {
        toast.error(
          err instanceof Error ? err.message : "Failed to submit decision"
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Read-only state after submission ──
  if (submitted) {
    return <SubmittedBar submitted={submitted} isSelectMode={isSelectMode} />;
  }

  if (isSelectMode) {
    return <SelectModeBar
      selectedFile={selectedFile ?? null}
      reason={reason}
      onReasonChange={setReason}
      hasReason={hasReason}
      submitting={submitting}
      textareaRef={textareaRef}
      onSubmit={submit}
    />;
  }

  return <ReviewModeBar
    reason={reason}
    onReasonChange={setReason}
    canSubmitNegative={canSubmitNegative}
    submitting={submitting}
    textareaRef={textareaRef}
    onSubmit={submit}
    chips={feedbackChips}
    selectedChips={selectedChips}
    onToggleChip={toggleChip}
  />;
}

/* ── Read-only submitted state ── */

function SubmittedBar({
  submitted,
  isSelectMode,
}: {
  submitted: SubmittedState;
  isSelectMode: boolean;
}) {
  const { decision, selectedFile, reason } = submitted;

  const icon =
    decision === "approved" ? (
      <CheckCircle2 className="w-4 h-4 text-stage-approved shrink-0" />
    ) : decision === "rejected" ? (
      <XCircle className="w-4 h-4 text-stage-rejected shrink-0" />
    ) : (
      <Revise className="w-4 h-4 text-stage-revising shrink-0" />
    );

  const label =
    decision === "approved"
      ? isSelectMode && selectedFile
        ? `Selected: ${selectedFile}`
        : "Approved"
      : decision === "rejected"
        ? "Rejected"
        : "Revision requested";

  const color =
    decision === "approved"
      ? "text-stage-approved"
      : decision === "rejected"
        ? "text-stage-rejected"
        : "text-stage-revising";

  return (
    <div className="border-t border-border bg-background shrink-0">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <span className={cn("text-xs font-semibold", color)}>
            {label}
          </span>
          {reason && (
            <p className="text-xs text-text-secondary mt-1 whitespace-pre-wrap leading-relaxed">
              {reason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Review mode: approve / revise / reject ── */

function ReviewModeBar({
  reason,
  onReasonChange,
  canSubmitNegative,
  submitting,
  textareaRef,
  onSubmit,
  chips,
  selectedChips,
  onToggleChip,
}: {
  reason: string;
  onReasonChange: (v: string) => void;
  canSubmitNegative: boolean;
  submitting: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onSubmit: (d: Decision) => void;
  chips: FeedbackChip[];
  selectedChips: SelectedChip[];
  onToggleChip: (chip: FeedbackChip) => void;
}) {
  return (
    <div className="border-t border-border bg-background shrink-0">
      <div className="px-3 pt-2.5 pb-1.5">
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Add feedback..."
          disabled={submitting}
          rows={1}
          className="w-full resize-none rounded-md bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted outline-none focus:ring-1 focus:ring-active/40 transition-shadow"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) {
              e.preventDefault();
              onSubmit("approved");
            }
          }}
        />
      </div>

      {chips.length > 0 && (
        <div className="px-3 pb-1.5">
          <FeedbackChips
            chips={chips}
            selected={selectedChips}
            onToggle={onToggleChip}
            disabled={submitting}
          />
        </div>
      )}

      <div className="flex items-center justify-between px-3 pb-2.5">
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSubmit("rejected")}
            disabled={submitting || !canSubmitNegative}
            className={cn(
              "h-7 px-2.5 text-xs cursor-pointer gap-1 transition-colors",
              canSubmitNegative
                ? "text-stage-rejected hover:bg-stage-rejected/10"
                : "text-text-muted"
            )}
          >
            <X className="w-3 h-3" />
            Reject
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSubmit("revision_requested")}
            disabled={submitting || !canSubmitNegative}
            className={cn(
              "h-7 px-2.5 text-xs cursor-pointer gap-1 transition-colors",
              canSubmitNegative
                ? "text-stage-revising hover:bg-stage-revising/10"
                : "text-text-muted"
            )}
          >
            <RotateCcw className="w-3 h-3" />
            Request revision
          </Button>
          {!canSubmitNegative && (
            <span className="text-[10px] text-text-muted self-center ml-1">
              Requires feedback
            </span>
          )}
        </div>

        <Button
          size="sm"
          onClick={() => onSubmit("approved")}
          disabled={submitting}
          className="h-8 px-4 bg-stage-approved hover:bg-stage-approved/90 text-white font-semibold text-xs cursor-pointer gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          Approve
          <kbd className="ml-1 text-[9px] font-normal text-white/60">
            {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}↵
          </kbd>
        </Button>
      </div>
    </div>
  );
}

/* ── Select mode: pick one or reject all ── */

function SelectModeBar({
  selectedFile,
  reason,
  onReasonChange,
  hasReason,
  submitting,
  textareaRef,
  onSubmit,
}: {
  selectedFile: string | null;
  reason: string;
  onReasonChange: (v: string) => void;
  hasReason: boolean;
  submitting: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onSubmit: (d: Decision) => void;
}) {
  return (
    <div className="border-t border-border bg-background shrink-0">
      <div className="px-3 pt-2.5 pb-1.5">
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder={selectedFile ? "Add a note (optional)..." : "Why are none of these right? (required)..."}
          disabled={submitting}
          rows={1}
          className="w-full resize-none rounded-md bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted outline-none focus:ring-1 focus:ring-active/40 transition-shadow"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey && selectedFile) {
              e.preventDefault();
              onSubmit("approved");
            }
          }}
        />
      </div>

      <div className="flex items-center justify-between px-3 pb-2.5">
        <div className="flex items-center gap-2">
          {selectedFile ? (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-active" />
              <span className="text-[11px] font-medium text-text-primary truncate max-w-[200px]">
                {selectedFile}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <MousePointer className="w-3 h-3 text-text-muted" />
              <span className="text-[11px] text-text-muted">
                Click an image to select it
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSubmit("revision_requested")}
            disabled={submitting || !hasReason}
            className={cn(
              "h-7 px-2.5 text-xs cursor-pointer gap-1 transition-colors",
              hasReason
                ? "text-stage-rejected hover:bg-stage-rejected/10"
                : "text-text-muted"
            )}
          >
            <X className="w-3 h-3" />
            None of these
          </Button>

          <Button
            size="sm"
            onClick={() => onSubmit("approved")}
            disabled={submitting || !selectedFile}
            className={cn(
              "h-8 px-4 font-semibold text-xs cursor-pointer gap-1.5 transition-all",
              selectedFile
                ? "bg-active hover:bg-active/90 text-white"
                : "bg-surface text-text-muted"
            )}
          >
            <Check className="w-3.5 h-3.5" />
            {selectedFile ? "Submit selection" : "Select one"}
          </Button>
        </div>
      </div>
    </div>
  );
}
