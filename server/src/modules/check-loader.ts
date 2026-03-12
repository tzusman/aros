import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { CheckModule } from "@aros/types";
import { checkManifestSchema, type CheckManifest } from "./schemas.js";

export function loadCheckManifest(modulesDir: string, name: string): CheckManifest {
  const manifestPath = path.join(modulesDir, "checks", name, "manifest.json");
  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  return checkManifestSchema.parse(raw);
}

export async function loadCheck(name: string, modulesDir: string): Promise<CheckModule> {
  const entrypoint = path.join(modulesDir, "checks", name, "check.js");
  const mod = await import(pathToFileURL(entrypoint).href);
  return mod.default;
}

export async function loadAllChecks(modulesDir: string): Promise<Map<string, CheckModule>> {
  const checks = new Map<string, CheckModule>();
  const checksDir = path.join(modulesDir, "checks");
  if (!fs.existsSync(checksDir)) return checks;
  for (const entry of fs.readdirSync(checksDir)) {
    const stat = fs.statSync(path.join(checksDir, entry));
    if (!stat.isDirectory()) continue;
    const jsPath = path.join(checksDir, entry, "check.js");
    if (!fs.existsSync(jsPath)) continue;
    checks.set(entry, await loadCheck(entry, modulesDir));
  }
  return checks;
}
