import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api/client";
import { useApp } from "@/context/app-context";
import { toast } from "sonner";
import type { Decision } from "@/lib/api/types";

export function DecisionBar({ deliverableId }: { deliverableId: string }) {
  const { dispatch } = useApp();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(decision: Decision) {
    if (decision !== "approved" && !reason.trim()) return;
    setSubmitting(true);
    try {
      await api.submitDecision(deliverableId, {
        decision,
        reason: reason.trim() || undefined,
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
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Add a reason (required for Revise/Reject)..."
        className="flex-1 h-8 text-xs bg-surface border-none"
        disabled={submitting}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => submit("approved")}
          disabled={submitting}
          className="bg-stage-approved hover:bg-stage-approved/90 text-background font-semibold text-xs cursor-pointer"
        >
          Approve
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
          Reject
        </Button>
      </div>
    </div>
  );
}
