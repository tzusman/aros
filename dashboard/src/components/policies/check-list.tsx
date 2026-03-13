import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Settings, X, ChevronUp } from "lucide-react";
import type { PolicyObjectiveCheck } from "@/lib/api/types";

interface CheckListProps {
  checks: PolicyObjectiveCheck[];
  onChecksChange: (checks: PolicyObjectiveCheck[]) => void;
  onImportClick: () => void;
}

export function CheckList({ checks, onChecksChange, onImportClick }: CheckListProps) {
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

  function removeCheck(name: string) {
    onChecksChange(checks.filter((c) => c.name !== name));
  }

  function updateCheck(name: string, updates: Partial<PolicyObjectiveCheck>) {
    onChecksChange(
      checks.map((c) => (c.name === name ? { ...c, ...updates } : c))
    );
  }

  function updateConfig(name: string, key: string, value: string) {
    const check = checks.find((c) => c.name === name);
    if (!check) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value;
    }
    updateCheck(name, { config: { ...check.config, [key]: parsed } });
  }

  return (
    <div className="px-6 py-4 border-b border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Objective Checks</span>
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
            {checks.length}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onImportClick}
          className="cursor-pointer text-xs border-dashed border-primary text-primary hover:bg-primary/5"
        >
          + Import check
        </Button>
      </div>

      <div className="space-y-1.5">
        {checks.map((check) => {
          const isExpanded = expandedCheck === check.name;
          return (
            <div key={check.name}>
              <div className="flex items-center justify-between bg-muted border border-border rounded-md px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{check.name}</span>
                    <Badge
                      variant={check.severity === "blocking" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {check.severity}
                    </Badge>
                  </div>
                  {Object.keys(check.config).length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {Object.entries(check.config)
                        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                        .join("  ·  ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => setExpandedCheck(isExpanded ? null : check.name)}
                    className="p-1 rounded hover:bg-background text-muted-foreground cursor-pointer"
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => removeCheck(check.name)}
                    className="p-1 rounded hover:bg-background text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border border-t-0 border-border rounded-b-md px-3 py-2.5 bg-background space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16">Severity:</span>
                    <select
                      value={check.severity}
                      onChange={(e) => updateCheck(check.name, { severity: e.target.value as "blocking" | "warning" })}
                      className="text-xs bg-muted border border-border rounded px-2 py-1 cursor-pointer"
                    >
                      <option value="blocking">blocking</option>
                      <option value="warning">warning</option>
                    </select>
                  </div>
                  {Object.entries(check.config).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16 font-mono">{key}:</span>
                      <Input
                        value={JSON.stringify(value)}
                        onChange={(e) => updateConfig(check.name, key, e.target.value)}
                        className="h-7 text-xs font-mono flex-1"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 px-3 py-2 border border-dashed border-border rounded-md text-xs text-muted-foreground">
        Need a custom check? Create a <code className="bg-muted px-1 rounded">check.ts</code> module in{" "}
        <code className="bg-muted px-1 rounded">.aros/modules/checks/</code>.{" "}
        <a href="/check-template.ts" download className="text-primary hover:underline">
          Download template
        </a>
      </div>
    </div>
  );
}
