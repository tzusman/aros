import { Input } from "@/components/ui/input";
import { ChevronRight, Plus, X } from "lucide-react";

const AVAILABLE_STAGES = ["objective", "subjective", "human"] as const;

interface PolicySettingsBarProps {
  stages: string[];
  maxRevisions: number;
  failThreshold: number;
  onStagesChange: (stages: string[]) => void;
  onMaxRevisionsChange: (value: number) => void;
  onFailThresholdChange: (value: number) => void;
}

export function PolicySettingsBar({
  stages,
  maxRevisions,
  failThreshold,
  onStagesChange,
  onMaxRevisionsChange,
  onFailThresholdChange,
}: PolicySettingsBarProps) {
  const addableStages = AVAILABLE_STAGES.filter((s) => !stages.includes(s));

  function removeStage(stage: string) {
    onStagesChange(stages.filter((s) => s !== stage));
  }

  function addStage(stage: string) {
    const order = AVAILABLE_STAGES as readonly string[];
    const newStages = [...stages, stage].sort(
      (a, b) => order.indexOf(a) - order.indexOf(b)
    );
    onStagesChange(newStages);
  }

  return (
    <div className="flex items-center gap-4 flex-wrap px-6 py-3 border-b border-border bg-muted/30">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Stages:</span>
        {stages.map((stage, i) => (
          <div key={stage} className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 bg-background border border-border rounded px-2 py-0.5 text-xs text-foreground">
              {stage}
              <button
                onClick={() => removeStage(stage)}
                className="text-muted-foreground hover:text-destructive cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
            {i < stages.length - 1 && (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </div>
        ))}
        {addableStages.length > 0 && (
          <div className="relative group">
            <button className="border border-dashed border-border rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
              <Plus className="w-3 h-3" />
            </button>
            <div className="absolute top-full left-0 mt-1 bg-background border border-border rounded shadow-lg py-1 hidden group-hover:block z-10">
              {addableStages.map((s) => (
                <button
                  key={s}
                  onClick={() => addStage(s)}
                  className="block w-full text-left px-3 py-1 text-xs hover:bg-muted cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Max revisions:</span>
        <Input
          type="number"
          min={1}
          value={maxRevisions}
          onChange={(e) => onMaxRevisionsChange(Number(e.target.value) || 1)}
          className="w-14 h-7 text-xs text-center"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Fail threshold:</span>
        <Input
          type="number"
          min={1}
          value={failThreshold}
          onChange={(e) => onFailThresholdChange(Number(e.target.value) || 1)}
          className="w-14 h-7 text-xs text-center"
        />
      </div>
    </div>
  );
}
