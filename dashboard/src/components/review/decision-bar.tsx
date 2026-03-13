import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";
import { useApp } from "@/context/app-context";
import { toast } from "sonner";
import type { Decision, Deliverable } from "@/lib/api/types";

interface DecisionBarProps {
  deliverableId: string;
  selectedFile?: string | null;
  folderStrategy?: Deliverable["folder_strategy"];
}

export function DecisionBar({
  deliverableId,
  selectedFile,
  folderStrategy,
}: DecisionBarProps) {
  const { dispatch } = useApp();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSelectMode = folderStrategy === "select";
  const hasSelection = isSelectMode && !!selectedFile;

  async function submit(decision: Decision) {
    if (decision !== "approved" && !reason.trim()) return;
    if (decision === "approved" && isSelectMode && !selectedFile) return;

    setSubmitting(true);
    try {
      let finalReason = reason.trim() || undefined;
      if (decision === "approved" && selectedFile) {
        finalReason = finalReason
          ? `Selected: ${selectedFile}\n${finalReason}`
          : `Selected: ${selectedFile}`;
      }

      await api.submitDecision(deliverableId, {
        decision,
        reason: finalReason,
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
    <div className="h-decision flex items-center gap-3 px-5 border-t border-border bg-background shrink-0">
      {isSelectMode && (
        <div className="flex items-center gap-1.5 shrink-0">
          {hasSelection ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-stage-approved" />
              <span className="text-[10px] font-semibold text-stage-approved truncate max-w-[140px]">
                {selectedFile}
              </span>
            </>
          ) : (
            <>
              <span className="text-[10px] text-stage-human">⚠</span>
              <span className="text-[10px] text-stage-human font-medium">
                Select a file first
              </span>
            </>
          )}
        </div>
      )}
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={
          isSelectMode
            ? "Add a note (optional)..."
            : "Add a reason (required for Revise/Reject)..."
        }
        className="flex-1 h-8 text-xs bg-muted border-none"
        disabled={submitting}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => submit("approved")}
          disabled={submitting || (isSelectMode && !selectedFile)}
          className="bg-stage-approved hover:bg-stage-approved/90 text-background font-semibold text-xs cursor-pointer"
        >
          {hasSelection ? "Approve Selected" : "Approve"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => submit("revision_requested")}
          disabled={submitting || !reason.trim()}
          className="text-stage-revising border-stage-revising/30 hover:bg-stage-revising/10 text-xs cursor-pointer"
        >
          Revise
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => submit("rejected")}
          disabled={submitting || !reason.trim()}
          className="text-stage-rejected border-stage-rejected/30 hover:bg-stage-rejected/10 text-xs cursor-pointer"
        >
          {isSelectMode ? "Reject All" : "Reject"}
        </Button>
      </div>
    </div>
  );
}
