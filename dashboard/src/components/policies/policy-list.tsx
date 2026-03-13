import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { CreatePolicyModal } from "./create-policy-modal";
import type { PolicySummary } from "@/lib/api/types";

interface PolicyListProps {
  selectedPolicy: string | null;
  onSelect: (name: string) => void;
  refreshKey?: number;
}

export function PolicyList({ selectedPolicy, onSelect, refreshKey }: PolicyListProps) {
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const loadPolicies = useCallback(() => {
    api.listPolicies().then(setPolicies).catch(() => {});
  }, []);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies, refreshKey]);

  function handleCreated(name: string) {
    setShowCreate(false);
    loadPolicies();
    onSelect(name);
  }

  const existingNames = new Set(policies.map((p) => p.name));

  return (
    <aside className="w-queue flex flex-col border-r border-border bg-background shrink-0">
      <div className="p-3 border-b border-border flex justify-between items-center">
        <span className="text-xs font-semibold text-text-primary">
          Policies
        </span>
        <button
          onClick={() => setShowCreate(true)}
          className="w-6 h-6 bg-surface border border-border rounded-md flex items-center justify-center cursor-pointer hover:bg-border transition-colors"
          aria-label="Create new policy"
        >
          <Plus className="w-3 h-3 text-text-secondary" />
        </button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1">
          {policies.map((p) => (
            <button
              key={p.name}
              onClick={() => onSelect(p.name)}
              className={cn(
                "w-full text-left px-2 py-2 rounded-md mb-0.5 cursor-pointer transition-colors",
                selectedPolicy === p.name
                  ? "bg-surface border-l-[3px] border-l-active"
                  : "hover:bg-surface/50 border-l-[3px] border-l-transparent"
              )}
            >
              <div className="text-[11px] text-text-primary font-medium">
                {p.name}
              </div>
              <div className="text-[8px] text-text-muted">
                {p.stages.length} stages · {p.max_revisions} revisions max
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>

      {showCreate && (
        <CreatePolicyModal
          existingNames={existingNames}
          onCreated={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </aside>
  );
}
