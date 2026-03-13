import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brain, Settings, X } from "lucide-react";
import type { PolicySubjectiveCriterion } from "@/lib/api/types";

interface CriteriaListProps {
  criteria: PolicySubjectiveCriterion[];
  passThreshold: number;
  registryCriteriaNames: Set<string>;
  onCriteriaChange: (criteria: PolicySubjectiveCriterion[]) => void;
  onPassThresholdChange: (value: number) => void;
  onImportClick: () => void;
  onCreateClick: () => void;
  onEditClick: (name: string) => void;
}

export function CriteriaList({
  criteria,
  passThreshold,
  registryCriteriaNames,
  onCriteriaChange,
  onPassThresholdChange,
  onImportClick,
  onCreateClick,
  onEditClick,
}: CriteriaListProps) {
  const [expandedCriterion, setExpandedCriterion] = useState<string | null>(null);

  function removeCriterion(name: string) {
    onCriteriaChange(criteria.filter((c) => c.name !== name));
  }

  function updateWeight(name: string, weight: number) {
    onCriteriaChange(
      criteria.map((c) => (c.name === name ? { ...c, weight } : c))
    );
  }

  function isRegistry(name: string): boolean {
    return registryCriteriaNames.has(name);
  }

  return (
    <div className="px-6 py-4 border-b border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Subjective Criteria</span>
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
            {criteria.length}
          </span>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onImportClick}
            className="cursor-pointer text-xs border-dashed border-purple-500 text-purple-500 hover:bg-purple-500/5"
          >
            + Import criterion
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onCreateClick}
            className="cursor-pointer text-xs border-purple-500 text-purple-500 bg-purple-500/5 hover:bg-purple-500/10"
          >
            + Create new
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Pass threshold:</span>
        <Input
          type="number"
          min={0}
          value={passThreshold}
          onChange={(e) => onPassThresholdChange(Number(e.target.value) || 0)}
          className="w-14 h-7 text-xs text-center"
        />
        <span className="text-xs text-muted-foreground">/ 10</span>
      </div>

      <div className="space-y-1.5">
        {criteria.map((criterion) => {
          const fromRegistry = isRegistry(criterion.name);
          const isExpanded = expandedCriterion === criterion.name;

          return (
            <div key={criterion.name}>
              <div className="flex items-center justify-between bg-muted border border-border rounded-md px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{criterion.name}</span>
                    <span className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 text-muted-foreground">
                      {fromRegistry ? "registry" : "custom"}
                    </span>
                  </div>
                  {criterion.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {criterion.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">w: {criterion.weight}</span>
                  <button
                    onClick={() => {
                      if (fromRegistry) {
                        setExpandedCriterion(isExpanded ? null : criterion.name);
                      } else {
                        onEditClick(criterion.name);
                      }
                    }}
                    className="p-1 rounded hover:bg-background text-muted-foreground cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => removeCriterion(criterion.name)}
                    className="p-1 rounded hover:bg-background text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {isExpanded && fromRegistry && (
                <div className="border border-t-0 border-border rounded-b-md px-3 py-2.5 bg-background">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Weight:</span>
                    <Input
                      type="number"
                      min={1}
                      value={criterion.weight}
                      onChange={(e) => updateWeight(criterion.name, Number(e.target.value) || 1)}
                      className="h-7 text-xs w-20"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
