import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PipelineFlow } from "./pipeline-flow";
import { SettingsCard } from "./settings-card";
import { JsonEditor } from "./json-editor";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import type { Policy } from "@/lib/api/types";

interface PolicyEditorProps {
  policy: Policy;
}

export function PolicyEditor({ policy }: PolicyEditorProps) {
  const [showJson, setShowJson] = useState(false);
  const [rawJson, setRawJson] = useState(policy.raw_json);
  const [saving, setSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Reset rawJson when policy changes (component should also be keyed by policy.name)
  useEffect(() => {
    setRawJson(policy.raw_json);
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

  async function save() {
    setSaving(true);
    try {
      // If JSON view was used, parse and save the edited JSON
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
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            {policy.name}
          </h2>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowJson(!showJson)}
            className="text-[10px] cursor-pointer"
          >
            {showJson ? "Structured" : "View JSON"}
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
        <>
          <div className="mb-5">
            <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
              Review Pipeline
            </div>
            <PipelineFlow policy={policy} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SettingsCard title="Objective Checks">
              {policy.objective.checks.map((check, i) => (
                <div
                  key={i}
                  className="flex justify-between py-0.5 border-b border-background last:border-0"
                >
                  <span>{check.type || check.module}</span>
                  <span
                    className={
                      check.severity === "blocking"
                        ? "text-stage-rejected"
                        : "text-stage-human"
                    }
                  >
                    {check.severity}
                  </span>
                </div>
              ))}
            </SettingsCard>

            <SettingsCard title="Subjective Criteria">
              {policy.subjective.criteria.map((c, i) => (
                <div
                  key={i}
                  className="flex justify-between py-0.5 border-b border-background last:border-0"
                >
                  <span>{c.name}</span>
                  <span>weight: {c.weight.toFixed(2)}</span>
                </div>
              ))}
              <div className="mt-1.5 pt-1 border-t border-border text-text-muted">
                Pass threshold: {policy.subjective.pass_threshold}
              </div>
            </SettingsCard>

            <SettingsCard title="Human Review">
              <div>
                Strategy: <span className="text-text-primary">{policy.human.assignment_strategy}</span>
              </div>
              <div>
                Reviewers: <span className="text-text-primary">{policy.human.required_reviewers}</span>
              </div>
              <div>
                SLA: <span className="text-text-primary">{policy.human.sla_hours}h</span>
              </div>
            </SettingsCard>

            <SettingsCard title="Revision Settings">
              <div>
                Max revisions: <span className="text-text-primary">{policy.max_revisions}</span>
              </div>
              <div>
                Mode: <span className="text-text-primary">{policy.revision_handling.mode}</span>
              </div>
              {policy.revision_handling.max_auto_revisions != null && (
                <div>
                  Auto revisions: <span className="text-text-primary">{policy.revision_handling.max_auto_revisions}</span>
                </div>
              )}
              {policy.revision_handling.escalate_after_auto_fail != null && (
                <div>
                  Escalate on fail: <span className="text-text-primary">{policy.revision_handling.escalate_after_auto_fail ? "Yes" : "No"}</span>
                </div>
              )}
            </SettingsCard>

            <SettingsCard title="Notifications">
              {policy.default_notifications.length > 0 ? (
                policy.default_notifications.map((n, i) => (
                  <div key={i} className="mb-1">
                    <div>
                      Driver: <span className="text-text-primary">{n.driver}</span>
                    </div>
                    <div>
                      Events: <span className="text-text-primary">{n.events.join(", ")}</span>
                    </div>
                  </div>
                ))
              ) : (
                <span className="text-text-muted">No default notifications</span>
              )}
            </SettingsCard>
          </div>
        </>
      )}
    </div>
  );
}
