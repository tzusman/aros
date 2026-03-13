import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, FileText, Shield, Brain } from "lucide-react";
import { api } from "@/lib/api/client";
import type { Policy, PolicySummary } from "@/lib/api/types";

type Template = "blank" | "basic" | "full";

interface CreatePolicyModalProps {
  existingNames: Set<string>;
  onCreated: (name: string) => void;
  onClose: () => void;
}

const TEMPLATES: Record<Template, { label: string; description: string; icon: typeof FileText; stages: string[] }> = {
  blank: {
    label: "Blank",
    description: "Empty policy — add stages, checks, and criteria yourself",
    icon: FileText,
    stages: [],
  },
  basic: {
    label: "Basic",
    description: "Objective checks + human review. No AI scoring.",
    icon: Shield,
    stages: ["objective", "human"],
  },
  full: {
    label: "Full Pipeline",
    description: "Automated checks → AI evaluation → human review",
    icon: Brain,
    stages: ["objective", "subjective", "human"],
  },
};

function buildFromTemplate(name: string, template: Template): Policy {
  const t = TEMPLATES[template];
  const policy: Policy = { name, stages: t.stages, max_revisions: template === "blank" ? 1 : 3 };
  if (t.stages.includes("objective")) {
    policy.objective = { checks: [], fail_threshold: 1 };
  }
  if (t.stages.includes("subjective")) {
    policy.subjective = { criteria: [], pass_threshold: 6 };
  }
  if (t.stages.includes("human")) {
    policy.human = { required: true };
  }
  return policy;
}

export function CreatePolicyModal({ existingNames, onCreated, onClose }: CreatePolicyModalProps) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Template | string>("full");
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.listPolicies().then(setPolicies).catch(() => {});
  }, []);

  function validate(): boolean {
    if (!name.trim()) { setError("Name is required"); return false; }
    if (!/^[a-z][a-z0-9-]*$/.test(name)) { setError("Lowercase letters, numbers, and hyphens only"); return false; }
    if (existingNames.has(name)) { setError("A policy with this name already exists"); return false; }
    setError(null);
    return true;
  }

  async function handleCreate() {
    if (!validate()) return;
    setCreating(true);
    try {
      let policy: Policy;
      if (selected === "blank" || selected === "basic" || selected === "full") {
        policy = buildFromTemplate(name, selected);
      } else {
        const source = await api.getPolicy(selected);
        policy = { ...source, name };
      }
      await api.savePolicy(name, policy);
      onCreated(name);
    } catch {
      setError("Failed to create policy");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg w-[520px] max-h-[90vh] flex flex-col shadow-lg mx-4">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="text-sm font-semibold">Create New Policy</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block">Policy Name</label>
            <Input
              placeholder="e.g. landing-page-copy"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              className="h-8 text-sm"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground mt-1">Lowercase with hyphens. Must be unique.</p>
            {error && <p className="text-[11px] text-destructive mt-1">{error}</p>}
          </div>

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Start from template</p>
            <div className="space-y-1.5">
              {(Object.entries(TEMPLATES) as [Template, typeof TEMPLATES[Template]][]).map(([key, t]) => {
                const Icon = t.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setSelected(key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md border-2 text-left cursor-pointer transition-colors ${
                      selected === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{t.label}</div>
                      <div className="text-xs text-muted-foreground">{t.description}</div>
                      {t.stages.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {t.stages.map((s) => (
                            <span key={s} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {policies.length > 0 && (
            <div>
              <div className="border-t border-border pt-4">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Or clone an existing policy</p>
                <div className="space-y-1.5">
                  {policies.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => setSelected(p.name)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md border-2 text-left cursor-pointer transition-colors ${
                        selected === p.name ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 text-sm">
                        📋
                      </div>
                      <div>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.stages.length} stages · {p.max_revisions} revisions max
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={creating || !name.trim()} className="cursor-pointer">
            {creating ? "Creating..." : "Create Policy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
