import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";
import { useApp } from "@/context/app-context";
import { toast } from "sonner";
import { Info, Check, RotateCcw, X } from "lucide-react";
import type { Decision } from "@/lib/api/types";
import type { FileAnnotations } from "@/pages/review-page";

interface DecisionBarProps {
  deliverableId: string;
  brief: string;
  annotations: FileAnnotations;
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

export function DecisionBar({ deliverableId, brief, annotations }: DecisionBarProps) {
  const { dispatch } = useApp();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showBrief, setShowBrief] = useState(false);

  async function submit(decision: Decision) {
    if (decision !== "approved" && !reason.trim()) return;
    setSubmitting(true);

    // Build full reason from typed feedback + per-file annotations
    const annotationBlock = serializeAnnotations(annotations);
    const parts = [reason.trim(), annotationBlock].filter(Boolean);
    const fullReason = parts.join("\n\n") || undefined;

    try {
      await api.submitDecision(deliverableId, {
        decision,
        reason: fullReason,
      });
      dispatch({ type: "REMOVE_FROM_QUEUE", id: deliverableId });
      setReason("");
      toast.success(
        decision === "approved"
          ? "Approved"
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

  return (
    <div className="border-t border-border bg-background shrink-0">
      {/* Collapsible brief */}
      {showBrief && brief && (
        <div className="px-4 py-3 border-b border-border bg-surface/50 max-h-32 overflow-y-auto">
          <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
            {brief}
          </p>
        </div>
      )}

      {/* Action row */}
      <div className="h-11 flex items-center gap-2 px-3">
        {brief && (
          <button
            onClick={() => setShowBrief(!showBrief)}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface text-text-muted hover:text-text-secondary cursor-pointer transition-colors shrink-0"
            aria-label="Toggle brief"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        )}

        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Feedback (required for revise/reject)..."
          className="flex-1 h-7 text-xs bg-surface border-none"
          disabled={submitting}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.metaKey) {
              submit("approved");
            }
          }}
        />

        <div className="flex gap-1.5 shrink-0">
          <Button
            size="sm"
            onClick={() => submit("approved")}
            disabled={submitting}
            className="h-7 px-3 bg-stage-approved hover:bg-stage-approved/90 text-white font-medium text-xs cursor-pointer gap-1"
          >
            <Check className="w-3 h-3" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => submit("revision_requested")}
            disabled={submitting || !reason.trim()}
            className="h-7 px-2.5 text-stage-revising border-stage-revising/30 hover:bg-stage-revising/10 text-xs cursor-pointer gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            Revise
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => submit("rejected")}
            disabled={submitting || !reason.trim()}
            className="h-7 px-2.5 text-stage-rejected border-stage-rejected/30 hover:bg-stage-rejected/10 text-xs cursor-pointer gap-1"
          >
            <X className="w-3 h-3" />
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}
