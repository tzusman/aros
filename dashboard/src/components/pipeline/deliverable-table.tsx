import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronUp, ChevronDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRelativeTime } from "@/lib/hooks/use-relative-time";
import { cn } from "@/lib/utils";
import type { DeliverableSummary, Stage } from "@/lib/api/types";

type SortKey = "title" | "stage" | "policy" | "source_agent" | "entered_stage_at";
type SortDir = "asc" | "desc";

const stageStyles: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-text-muted/15", text: "text-text-muted" },
  objective: { bg: "bg-stage-objective/15", text: "text-stage-objective" },
  subjective: { bg: "bg-stage-subjective/15", text: "text-stage-subjective" },
  human: { bg: "bg-stage-human/15", text: "text-stage-human" },
  revision_requested: { bg: "bg-stage-revising/15", text: "text-stage-revising" },
  approved: { bg: "bg-stage-approved/15", text: "text-stage-approved" },
  rejected: { bg: "bg-stage-rejected/15", text: "text-stage-rejected" },
};

const stageLabels: Record<string, string> = {
  revision_requested: "Revising",
};

function StagePill({ stage }: { stage: Stage }) {
  const style = stageStyles[stage] || stageStyles.objective;
  const label = stageLabels[stage] || stage.charAt(0).toUpperCase() + stage.slice(1);
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded ${style.bg} ${style.text}`}>
      {label}
    </span>
  );
}

function TimeCell({ dateStr }: { dateStr: string }) {
  const time = useRelativeTime(dateStr);
  return <span>{time === "just now" ? time : `${time} ago`}</span>;
}

interface DeliverableTableProps {
  deliverables: DeliverableSummary[];
}

export function DeliverableTable({ deliverables }: DeliverableTableProps) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>("entered_stage_at");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    return [...deliverables].sort((a, b) => {
      const aVal = a[sortKey] ?? "";
      const bVal = b[sortKey] ?? "";
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [deliverables, sortKey, sortDir]);

  const columns: { key: SortKey; label: string; flex: string }[] = [
    { key: "title", label: "Deliverable", flex: "flex-[3]" },
    { key: "stage", label: "Stage", flex: "flex-1" },
    { key: "policy", label: "Policy", flex: "flex-1" },
    { key: "source_agent", label: "Agent", flex: "flex-1" },
    { key: "entered_stage_at", label: "Entered", flex: "flex-1" },
  ];

  return (
    <ScrollArea className="flex-1">
      <div className="bg-surface rounded-lg overflow-hidden">
        <div className="flex px-3 py-2 border-b border-border text-[9px] text-text-muted uppercase tracking-wider">
          {columns.map((col) => (
            <button
              key={col.key}
              onClick={() => toggleSort(col.key)}
              className={cn(
                col.flex,
                "flex items-center gap-0.5 cursor-pointer hover:text-text-secondary transition-colors text-left"
              )}
            >
              {col.label}
              {sortKey === col.key && (
                sortDir === "asc"
                  ? <ChevronUp className="w-2.5 h-2.5" />
                  : <ChevronDown className="w-2.5 h-2.5" />
              )}
            </button>
          ))}
        </div>
        {sorted.map((d) => (
          <div
            key={d.id}
            onClick={() => navigate(`/review?id=${d.id}`)}
            className="flex px-3 py-2 text-[11px] items-center border-b border-background last:border-0 hover:bg-background/50 cursor-pointer transition-colors"
          >
            <div className="flex-[3] text-text-primary truncate">
              {d.title}
              {d.is_folder && (
                <span className="text-[8px] text-stage-subjective ml-1">
                  folder
                </span>
              )}
            </div>
            <div className="flex-1">
              <StagePill stage={d.stage} />
            </div>
            <div className="flex-1 text-text-secondary">{d.policy}</div>
            <div className="flex-1 text-text-secondary">{d.source_agent}</div>
            <div className="flex-1 text-text-secondary">
              <TimeCell dateStr={d.entered_stage_at} />
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="py-8 text-center text-xs text-text-muted">
            No deliverables in this stage
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
