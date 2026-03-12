import * as fs from "node:fs";
import * as path from "node:path";
import type { CriterionDef } from "@aros/types";
import { criterionManifestSchema } from "./schemas.js";

export function loadCriteriaLibrary(modulesDir: string): Map<string, CriterionDef> {
  const library = new Map<string, CriterionDef>();
  const criteriaDir = path.join(modulesDir, "criteria");
  if (!fs.existsSync(criteriaDir)) return library;
  for (const entry of fs.readdirSync(criteriaDir)) {
    const manifestPath = path.join(criteriaDir, entry, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const parsed = criterionManifestSchema.parse(raw);
    library.set(parsed.name, {
      name: parsed.name,
      description: parsed.description,
      applicableTo: parsed.applicableTo,
      defaultWeight: parsed.defaultWeight,
      scale: parsed.scale,
      promptGuidance: parsed.promptGuidance,
    });
  }
  return library;
}
