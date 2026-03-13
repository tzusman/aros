import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { JsonEditor } from "./json-editor";
import { PolicySettingsBar } from "./policy-settings-bar";
import { CheckList } from "./check-list";
import { CriteriaList } from "./criteria-list";
import { ImportModal } from "./import-modal";
import { CriteriaFormModal } from "./criteria-form-modal";
import { api } from "@/lib/api/client";
import { toast } from "sonner";
import type {
  Policy,
  PolicyObjectiveCheck,
  PolicySubjectiveCriterion,
  CustomCriterion,
  RegistryCatalog,
} from "@/lib/api/types";
import { Trash2, ToggleLeft, ToggleRight } from "lucide-react";

interface PolicyEditorProps {
  policy: Policy;
  onDeleted?: () => void;
}

export function PolicyEditor({ policy: initial, onDeleted }: PolicyEditorProps) {
  const [showJson, setShowJson] = useState(false);
  const [rawJson, setRawJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Mutable policy state
  const [stages, setStages] = useState<string[]>(initial.stages);
  const [maxRevisions, setMaxRevisions] = useState(initial.max_revisions);
  const [failThreshold, setFailThreshold] = useState(initial.objective?.fail_threshold ?? 1);
  const [checks, setChecks] = useState<PolicyObjectiveCheck[]>(initial.objective?.checks ?? []);
  const [criteria, setCriteria] = useState<PolicySubjectiveCriterion[]>(initial.subjective?.criteria ?? []);
  const [passThreshold, setPassThreshold] = useState(initial.subjective?.pass_threshold ?? 6);
  const [humanEnabled, setHumanEnabled] = useState(!!initial.human);

  // Registry data for import
  const [catalog, setCatalog] = useState<RegistryCatalog | null>(null);
  const [registryCriteriaNames, setRegistryCriteriaNames] = useState<Set<string>>(new Set());
  const [customCriteria, setCustomCriteria] = useState<CustomCriterion[]>([]);

  // Modal state
  const [importType, setImportType] = useState<"check" | "criterion" | null>(null);
  const [criteriaFormTarget, setCriteriaFormTarget] = useState<CustomCriterion | null | undefined>(undefined);

  // Load registry catalog and custom criteria
  useEffect(() => {
    api.getRegistryCatalog().then((cat) => {
      setCatalog(cat);
      setRegistryCriteriaNames(new Set(cat.criteria.map((c) => c.name)));
    }).catch(() => {});
    api.listCustomCriteria().then(setCustomCriteria).catch(() => {});
  }, []);

  // Reset when policy changes
  useEffect(() => {
    setStages(initial.stages);
    setMaxRevisions(initial.max_revisions);
    setFailThreshold(initial.objective?.fail_threshold ?? 1);
    setChecks(initial.objective?.checks ?? []);
    setCriteria(initial.subjective?.criteria ?? []);
    setPassThreshold(initial.subjective?.pass_threshold ?? 6);
    setHumanEnabled(!!initial.human);
    setShowJson(false);
    setJsonError(null);
  }, [initial]);

  // Build policy from current state
  const buildPolicy = useCallback((): Policy => {
    const p: Policy = {
      ...initial,
      name: initial.name,
      stages,
      max_revisions: maxRevisions,
    };

    if (stages.includes("objective")) {
      p.objective = { checks, fail_threshold: failThreshold };
    } else {
      delete p.objective;
    }

    if (stages.includes("subjective")) {
      p.subjective = {
        ...initial.subjective,
        criteria,
        pass_threshold: passThreshold,
      };
    } else {
      delete p.subjective;
    }

    if (stages.includes("human") && humanEnabled) {
      p.human = { required: true };
    } else {
      delete p.human;
    }

    return p;
  }, [initial, stages, maxRevisions, checks, failThreshold, criteria, passThreshold, humanEnabled]);

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
      const toSave = showJson && !jsonError ? JSON.parse(rawJson) : buildPolicy();
      await api.savePolicy(initial.name, toSave);
      toast.success("Policy saved");
    } catch {
      toast.error("Failed to save policy");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const msg = "Delete this policy? If the policy was not committed to git, this cannot be undone.";
    if (!confirm(msg)) return;
    setDeleting(true);
    try {
      await api.deletePolicy(initial.name);
      toast.success("Policy deleted");
      onDeleted?.();
    } catch {
      toast.error("Failed to delete policy");
    } finally {
      setDeleting(false);
    }
  }

  // Import handlers
  function handleImportCheck(name: string) {
    const regCheck = catalog?.checks.find((c) => c.name === name);
    if (!regCheck) return;
    const newCheck: PolicyObjectiveCheck = {
      name: regCheck.name,
      config: regCheck.config ?? {},
      severity: (regCheck.severity as "blocking" | "warning") ?? "warning",
    };
    setChecks((prev) => [...prev, newCheck]);
  }

  function handleImportCriterion(name: string) {
    const regCrit = catalog?.criteria.find((c) => c.name === name);
    if (!regCrit) return;
    const newCrit: PolicySubjectiveCriterion = {
      name: regCrit.name,
      description: regCrit.description,
      weight: regCrit.defaultWeight ?? 2,
      scale: regCrit.scale ?? 10,
    };
    setCriteria((prev) => [...prev, newCrit]);
    setImportType(null);
  }

  // Criteria form handlers
  async function handleSaveCriterion(criterion: CustomCriterion) {
    try {
      if (criteriaFormTarget) {
        await api.updateCriterion(criteriaFormTarget.name, criterion);
      } else {
        await api.createCriterion(criterion);
      }
      // Refresh custom criteria list
      const updated = await api.listCustomCriteria();
      setCustomCriteria(updated);

      // Also add to policy criteria if new
      if (!criteriaFormTarget) {
        setCriteria((prev) => [
          ...prev,
          {
            name: criterion.name,
            description: criterion.description,
            weight: criterion.defaultWeight,
            scale: criterion.scale,
          },
        ]);
      }
      setCriteriaFormTarget(undefined);
      toast.success(criteriaFormTarget ? "Criterion updated" : "Criterion created");
    } catch {
      toast.error("Failed to save criterion");
    }
  }

  function handleEditCriterion(name: string) {
    const custom = customCriteria.find((c) => c.name === name);
    if (custom) {
      setCriteriaFormTarget(custom);
    }
  }

  // Compute sets for import modals
  const addedCheckNames = new Set(checks.map((c) => c.name));
  const addedCriterionNames = new Set(criteria.map((c) => c.name));

  const allCriterionNames = new Set([
    ...registryCriteriaNames,
    ...customCriteria.map((c) => c.name),
  ]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-border">
        <h2 className="text-base font-semibold">{initial.name}</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!showJson) setRawJson(JSON.stringify(buildPolicy(), null, 2));
              setShowJson(!showJson);
            }}
            className="text-xs cursor-pointer"
          >
            {showJson ? "Structured" : "View JSON"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-destructive hover:text-destructive cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Delete
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={saving || (showJson && !!jsonError)}
            className="text-xs cursor-pointer"
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {showJson ? (
        <div className="flex-1 p-5">
          <JsonEditor value={rawJson} onChange={handleJsonChange} />
        </div>
      ) : (
        <>
          {/* Settings Bar */}
          <PolicySettingsBar
            stages={stages}
            maxRevisions={maxRevisions}
            failThreshold={failThreshold}
            onStagesChange={setStages}
            onMaxRevisionsChange={setMaxRevisions}
            onFailThresholdChange={setFailThreshold}
          />

          {/* Objective Checks */}
          {stages.includes("objective") && (
            <CheckList
              checks={checks}
              onChecksChange={setChecks}
              onImportClick={() => setImportType("check")}
            />
          )}

          {/* Subjective Criteria */}
          {stages.includes("subjective") && (
            <CriteriaList
              criteria={criteria}
              passThreshold={passThreshold}
              registryCriteriaNames={registryCriteriaNames}
              onCriteriaChange={setCriteria}
              onPassThresholdChange={setPassThreshold}
              onImportClick={() => setImportType("criterion")}
              onCreateClick={() => setCriteriaFormTarget(null)}
              onEditClick={handleEditCriterion}
            />
          )}

          {/* Human Review Toggle */}
          {stages.includes("human") && (
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Human Review</span>
                <button
                  onClick={() => setHumanEnabled(!humanEnabled)}
                  className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  {humanEnabled ? (
                    <ToggleRight className="w-6 h-6 text-primary" />
                  ) : (
                    <ToggleLeft className="w-6 h-6" />
                  )}
                  <span className="text-xs">{humanEnabled ? "Enabled" : "Disabled"}</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Import Modal */}
      {importType === "check" && catalog && (
        <ImportModal
          title="Import Check from Registry"
          items={catalog.checks.map((c) => ({
            name: c.name,
            version: c.version,
            description: c.description,
          }))}
          alreadyAdded={addedCheckNames}
          onAdd={handleImportCheck}
          onClose={() => setImportType(null)}
        />
      )}
      {importType === "criterion" && catalog && (
        <ImportModal
          title="Import Criterion from Registry"
          items={catalog.criteria.map((c) => ({
            name: c.name,
            version: c.version,
            description: c.description,
          }))}
          alreadyAdded={addedCriterionNames}
          onAdd={handleImportCriterion}
          onClose={() => setImportType(null)}
        />
      )}

      {/* Criteria Form Modal */}
      {criteriaFormTarget !== undefined && (
        <CriteriaFormModal
          initial={criteriaFormTarget}
          existingNames={allCriterionNames}
          onSave={handleSaveCriterion}
          onClose={() => setCriteriaFormTarget(undefined)}
        />
      )}
    </div>
  );
}
