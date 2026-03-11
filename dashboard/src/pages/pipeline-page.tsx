import { useState, useEffect } from "react";
import { StageCards } from "@/components/pipeline/stage-cards";
import { DeliverableTable } from "@/components/pipeline/deliverable-table";
import { useApp } from "@/context/app-context";
import { api } from "@/lib/api/client";
import type { DeliverableSummary } from "@/lib/api/types";

// "In Progress" combines objective + subjective stages
// We fetch both and merge client-side
const stageFilterMap: Record<string, string[] | string> = {
  in_progress: ["objective", "subjective"],
  pending_human: "human",
  awaiting_revisions: "revision_requested",
  approved_72h: "approved",
  rejected_72h: "rejected",
};

export function PipelinePage() {
  const { state } = useApp();
  const [selectedStage, setSelectedStage] = useState("in_progress");
  const [deliverables, setDeliverables] = useState<DeliverableSummary[]>([]);

  useEffect(() => {
    const filter = stageFilterMap[selectedStage];
    if (Array.isArray(filter)) {
      // Composite stage — fetch each and merge
      Promise.all(filter.map((s) => api.listDeliverables(s)))
        .then((results) => setDeliverables(results.flat()))
        .catch(() => setDeliverables([]));
    } else {
      api.listDeliverables(filter).then(setDeliverables).catch(() => setDeliverables([]));
    }
  }, [selectedStage]);

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <StageCards
        counts={state.pipelineCounts}
        selectedStage={selectedStage}
        onSelect={setSelectedStage}
      />

      <div className="flex-1 min-h-0">
        <div className="text-xs font-semibold text-text-primary mb-2">
          {selectedStage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace("72h", "(72h)")}
          <span className="text-text-muted font-normal ml-2">
            — {deliverables.length} deliverables
          </span>
        </div>
        <DeliverableTable deliverables={deliverables} />
      </div>
    </div>
  );
}
