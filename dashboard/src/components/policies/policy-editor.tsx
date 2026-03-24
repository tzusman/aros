import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PipelineFlow } from "./pipeline-flow";
import { JsonEditor } from "./json-editor";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  ShieldAlert,
  Brain,
  User,
  Users,
  Clock,
  RotateCcw,
  ArrowUpRight,
  Bell,
  Hash,
  Gauge,
} from "lucide-react";
import type { Policy, PolicyHumanConfig } from "@/lib/api/types";

function isRichHumanConfig(
  human: Policy["human"],
): human is PolicyHumanConfig {
  return !!human && "assignment_strategy" in human;
}

interface PolicyEditorProps {
  policy: Policy;
  onDeleted?: () => void;
}

export function PolicyEditor({ policy, onDeleted }: PolicyEditorProps) {
  const [showJson, setShowJson] = useState(false);
  const [rawJson, setRawJson] = useState(policy.raw_json ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setRawJson(policy.raw_json ?? "");
    setJsonError(null);
    setShowJson(false);
  }, [policy.raw_json]);

  function handleJsonChange(value: string) {
    setRawJson(value);
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this policy? This cannot be undone if not committed to git.")) return;
    setDeleting(true);
    try {
      await api.deletePolicy(policy.name);
      toast.success("Policy deleted");
      onDeleted?.();
    } catch {
      toast.error("Failed to delete policy");
    } finally {
      setDeleting(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const toSave = showJson && !jsonError ? JSON.parse(rawJson) : policy;
      await api.savePolicy(policy.name, toSave);
      toast.success("Policy saved");
    } catch {
      toast.error("Failed to save policy");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5">
      <div className="flex justify-between items-center mb-5">
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            {policy.name}
          </h2>
          <p className="text-[10px] text-text-muted mt-0.5">
            {policy.stages.length} stages &middot; max {policy.max_revisions} revisions
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowJson(!showJson)}
            className="text-[10px] cursor-pointer"
          >
            {showJson ? "Visual" : "JSON"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="text-[10px] text-stage-rejected hover:text-stage-rejected cursor-pointer"
          >
            Delete
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={saving || (showJson && !!jsonError)}
            className="bg-active hover:bg-active/90 text-background text-[10px] font-semibold cursor-pointer"
          >
            Save
          </Button>
        </div>
      </div>

      {showJson ? (
        <JsonEditor value={rawJson} onChange={handleJsonChange} />
      ) : (
        <div className="space-y-5">
          {/* Pipeline visualization */}
          <section>
            <SectionLabel>Pipeline</SectionLabel>
            <PipelineFlow policy={policy} />
          </section>

          {/* Objective checks */}
          {policy.objective?.checks && (
            <section className="animate-fade-in-up" style={{ animationDelay: "50ms" }}>
              <SectionLabel>
                <ShieldCheck className="w-3.5 h-3.5 text-stage-objective inline mr-1 -mt-0.5" />
                Objective Checks
                <span className="text-text-muted font-normal ml-1.5">
                  fail threshold: {policy.objective.fail_threshold}
                </span>
              </SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {policy.objective.checks.map((check, i) => (
                  <div
                    key={i}
                    className="group relative bg-surface rounded-lg p-3 border border-border hover:border-stage-objective/40 transition-colors animate-scale-in"
                    style={{ animationDelay: `${100 + i * 60}ms` }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
                            check.severity === "blocking"
                              ? "bg-stage-rejected/10"
                              : "bg-stage-human/10"
                          )}
                        >
                          {check.severity === "blocking" ? (
                            <ShieldAlert className="w-3.5 h-3.5 text-stage-rejected" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5 text-stage-human" />
                          )}
                        </div>
                        <div>
                          <div className="text-[11px] font-medium text-text-primary">
                            {check.type || check.module}
                          </div>
                          {check.version && (
                            <div className="text-[9px] text-text-muted">
                              v{check.version}
                            </div>
                          )}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0",
                          check.severity === "blocking"
                            ? "bg-stage-rejected/10 text-stage-rejected"
                            : "bg-stage-human/10 text-stage-human"
                        )}
                      >
                        {check.severity}
                      </span>
                    </div>
                    {/* Config preview */}
                    {Object.keys(check.config).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(check.config).map(([k, v]) => (
                          <span
                            key={k}
                            className="text-[8px] bg-background px-1.5 py-0.5 rounded text-text-muted"
                          >
                            {k}: <span className="text-text-secondary">{String(v)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Subjective criteria */}
          {policy.subjective?.criteria && (
            <section className="animate-fade-in-up" style={{ animationDelay: "150ms" }}>
              <SectionLabel>
                <Brain className="w-3.5 h-3.5 text-stage-subjective inline mr-1 -mt-0.5" />
                Subjective Criteria
                {policy.subjective.evaluation_model && (
                  <span className="text-text-muted font-normal ml-1.5">
                    model: {policy.subjective.evaluation_model.replace("claude-", "").replace(/-\d+$/, "")}
                  </span>
                )}
              </SectionLabel>

              {/* Threshold gauge */}
              <div className="mb-3 flex items-center gap-3">
                <Gauge className="w-3.5 h-3.5 text-stage-subjective shrink-0" />
                <div className="flex-1">
                  <div className="flex justify-between text-[9px] mb-1">
                    <span className="text-text-muted">Pass threshold</span>
                    <span className="text-text-primary font-semibold">
                      {policy.subjective.pass_threshold}/{policy.subjective.criteria[0]?.scale || 10}
                    </span>
                  </div>
                  <div className="h-1.5 bg-background rounded-full overflow-hidden">
                    <div
                      className="h-full bg-stage-subjective rounded-full animate-bar-fill origin-left"
                      style={{
                        width: `${(policy.subjective.pass_threshold / (policy.subjective.criteria[0]?.scale || 10)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Criteria with weight bars */}
              <div className="space-y-1.5">
                {policy.subjective.criteria.map((c, i) => (
                  <div
                    key={i}
                    className="group bg-surface rounded-lg p-2.5 border border-border hover:border-stage-subjective/40 transition-colors animate-scale-in"
                    style={{ animationDelay: `${200 + i * 60}ms` }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-medium text-text-primary">
                        {c.name}
                      </span>
                      <span className="text-[9px] text-text-muted tabular-nums">
                        {(c.weight * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-[9px] text-text-muted leading-relaxed mb-2">
                      {c.description}
                    </p>
                    {/* Weight bar */}
                    <div className="h-1 bg-background rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full animate-bar-fill origin-left"
                        style={{
                          width: `${c.weight * 100}%`,
                          backgroundColor: `color-mix(in srgb, #8b5cf6 ${50 + c.weight * 100}%, #8b5cf680)`,
                          animationDelay: `${250 + i * 80}ms`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Human review & revision — side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Human review */}
            {policy.human && (
              <section className="animate-fade-in-up" style={{ animationDelay: "300ms" }}>
                <SectionLabel>
                  <User className="w-3.5 h-3.5 text-stage-human inline mr-1 -mt-0.5" />
                  Human Review
                </SectionLabel>
                <div className="bg-surface rounded-lg p-3.5 border border-border space-y-2.5">
                  {isRichHumanConfig(policy.human) ? (
                    <>
                      <ConfigRow
                        icon={<Users className="w-3 h-3 text-stage-human" />}
                        label="Reviewers"
                        value={`${policy.human.required_reviewers} (${policy.human.consensus_rule.replace("_", " ")})`}
                      />
                      <ConfigRow
                        icon={<User className="w-3 h-3 text-stage-human" />}
                        label="Assignment"
                        value={policy.human.assignment_strategy.replace("_", " ")}
                      />
                      <ConfigRow
                        icon={<Clock className="w-3 h-3 text-stage-human" />}
                        label="SLA"
                        value={`${policy.human.sla_hours}h`}
                      />
                    </>
                  ) : (
                    <ConfigRow
                      icon={<User className="w-3 h-3 text-stage-human" />}
                      label="Required"
                      value={policy.human.required ? "Yes" : "No"}
                    />
                  )}
                </div>
              </section>
            )}

            {/* Revision settings */}
            {policy.revision_handling && (
              <section className="animate-fade-in-up" style={{ animationDelay: "350ms" }}>
                <SectionLabel>
                  <RotateCcw className="w-3.5 h-3.5 text-stage-revising inline mr-1 -mt-0.5" />
                  Revisions
                </SectionLabel>
                <div className="bg-surface rounded-lg p-3.5 border border-border space-y-2.5">
                  <ConfigRow
                    icon={<Hash className="w-3 h-3 text-stage-revising" />}
                    label="Max"
                    value={String(policy.max_revisions)}
                  />
                  <ConfigRow
                    icon={<RotateCcw className="w-3 h-3 text-stage-revising" />}
                    label="Mode"
                    value={policy.revision_handling.mode.replace("_", " ")}
                  />
                  {policy.revision_handling.max_auto_revisions != null && (
                    <ConfigRow
                      icon={<Brain className="w-3 h-3 text-stage-revising" />}
                      label="Auto revisions"
                      value={String(policy.revision_handling.max_auto_revisions)}
                    />
                  )}
                  {policy.revision_handling.escalate_after_auto_fail != null && (
                    <ConfigRow
                      icon={<ArrowUpRight className="w-3 h-3 text-stage-revising" />}
                      label="Escalate on fail"
                      value={policy.revision_handling.escalate_after_auto_fail ? "Yes" : "No"}
                    />
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Notifications */}
          {policy.default_notifications && policy.default_notifications.length > 0 && (
            <section className="animate-fade-in-up" style={{ animationDelay: "400ms" }}>
              <SectionLabel>
                <Bell className="w-3.5 h-3.5 text-active inline mr-1 -mt-0.5" />
                Notifications
              </SectionLabel>
              <div className="flex flex-wrap gap-2">
                {policy.default_notifications.map((n, i) => (
                  <div
                    key={i}
                    className="bg-surface rounded-lg px-3 py-2 border border-border flex items-center gap-2 animate-scale-in"
                    style={{ animationDelay: `${450 + i * 60}ms` }}
                  >
                    <span className="text-[10px] font-medium text-text-primary capitalize">
                      {n.driver}
                    </span>
                    <span className="text-[8px] text-text-muted">
                      {n.events.map((e) => e.split(":")[1]).join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Helpers ── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2.5 flex items-center">
      {children}
    </div>
  );
}

function ConfigRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-5 h-5 rounded flex items-center justify-center bg-background shrink-0">
        {icon}
      </div>
      <span className="text-[10px] text-text-muted flex-1">{label}</span>
      <span className="text-[10px] text-text-primary font-medium">{value}</span>
    </div>
  );
}
