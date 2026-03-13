import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import type { CustomCriterion } from "@/lib/api/types";

interface CriteriaFormModalProps {
  initial?: CustomCriterion | null;
  existingNames: Set<string>;
  onSave: (criterion: CustomCriterion) => void;
  onClose: () => void;
}

export function CriteriaFormModal({ initial, existingNames, onSave, onClose }: CriteriaFormModalProps) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [defaultWeight, setDefaultWeight] = useState(initial?.defaultWeight ?? 2);
  const [scale, setScale] = useState(initial?.scale ?? 10);
  const [promptGuidance, setPromptGuidance] = useState(initial?.promptGuidance ?? "");
  const [applicableTo, setApplicableTo] = useState<string[]>(initial?.applicableTo ?? []);
  const [tagInput, setTagInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required";
    else if (!/^[a-z][a-z0-9-]*$/.test(name)) e.name = "Lowercase letters, numbers, and hyphens only";
    else if (!isEdit && existingNames.has(name)) e.name = "A criterion with this name already exists";
    if (!description.trim()) e.description = "Description is required";
    if (defaultWeight <= 0) e.defaultWeight = "Must be positive";
    if (scale <= 0) e.scale = "Must be positive";
    if (!promptGuidance.trim()) e.promptGuidance = "Prompt guidance is required";
    if (applicableTo.length === 0) e.applicableTo = "At least one content type is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    onSave({
      name,
      type: "criterion",
      version: initial?.version ?? "1.0.0",
      description,
      defaultWeight,
      scale,
      promptGuidance,
      applicableTo,
    });
  }

  function addTag() {
    const tag = tagInput.trim();
    if (tag && !applicableTo.includes(tag)) {
      setApplicableTo([...applicableTo, tag]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setApplicableTo(applicableTo.filter((t) => t !== tag));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg w-[520px] max-h-[90vh] flex flex-col shadow-lg mx-4">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="text-sm font-semibold">{isEdit ? "Edit Criterion" : "Create Custom Criterion"}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block">Name</label>
            <Input
              placeholder="e.g. emotional-resonance"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEdit}
              className="h-8 text-sm"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Lowercase with hyphens. Must be unique.</p>
            {errors.name && <p className="text-[11px] text-destructive mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block">Description</label>
            <textarea
              placeholder="What should the AI reviewer evaluate?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground mt-1">This is what the AI reviewer sees when scoring.</p>
            {errors.description && <p className="text-[11px] text-destructive mt-1">{errors.description}</p>}
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium mb-1.5 block">Default Weight</label>
              <Input
                type="number"
                min={1}
                value={defaultWeight}
                onChange={(e) => setDefaultWeight(Number(e.target.value) || 1)}
                className="h-8 text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Higher = more influence on final score</p>
              {errors.defaultWeight && <p className="text-[11px] text-destructive mt-1">{errors.defaultWeight}</p>}
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium mb-1.5 block">Scale</label>
              <Input
                type="number"
                min={1}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value) || 10)}
                className="h-8 text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Max score (typically 10)</p>
              {errors.scale && <p className="text-[11px] text-destructive mt-1">{errors.scale}</p>}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block">Prompt Guidance</label>
            <textarea
              placeholder="Detailed instructions for how the AI should score this criterion..."
              value={promptGuidance}
              onChange={(e) => setPromptGuidance(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Include examples of what each score range means.</p>
            {errors.promptGuidance && <p className="text-[11px] text-destructive mt-1">{errors.promptGuidance}</p>}
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block">Applicable To</label>
            <div className="flex flex-wrap gap-1.5 min-h-[32px] border border-input rounded-md px-2 py-1.5 bg-background">
              {applicableTo.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 bg-muted rounded px-1.5 py-0.5 text-xs">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                placeholder="Add content type..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addTag(); }
                }}
                onBlur={addTag}
                className="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">MIME type patterns (e.g. image/*, text/*). Press Enter to add.</p>
            {errors.applicableTo && <p className="text-[11px] text-destructive mt-1">{errors.applicableTo}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-border">
          <Button variant="outline" size="sm" onClick={onClose} className="cursor-pointer">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="cursor-pointer">
            {isEdit ? "Save Changes" : "Create Criterion"}
          </Button>
        </div>
      </div>
    </div>
  );
}
