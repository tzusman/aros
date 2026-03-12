import * as fs from "node:fs";
import * as path from "node:path";
import { readRegistry, readLockfile, lockModule } from "./registry.js";
import { fetchModuleFromGit, getLatestSha } from "./git-fetch.js";
import { compileCheckModule } from "./compile.js";
import {
  checkManifestSchema,
  criterionManifestSchema,
  validatePolicyManifest,
} from "./schemas.js";

export async function addModule(
  projectDir: string,
  moduleName: string,
  options?: { source?: string }
): Promise<void> {
  const arosDir = path.join(projectDir, ".aros");
  const registry = readRegistry(arosDir);
  const lockfile = readLockfile(arosDir);

  // Already installed?
  if (lockfile.locked[moduleName]) {
    return; // skip
  }

  // Determine module type from path prefix
  const [type] = moduleName.split("/"); // "checks", "criteria", "policies"

  // Search sources in order
  const sourcesToSearch = options?.source
    ? registry.sources.filter((s) => s.name === options.source)
    : registry.sources;

  let found = false;

  for (const source of sourcesToSearch) {
    try {
      const sha = await getLatestSha(source.url, source.branch, moduleName);
      const destDir = path.join(arosDir, "modules", moduleName);

      await fetchModuleFromGit(source.url, moduleName, sha, destDir);

      // Validate manifest
      const manifestPath = path.join(destDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        throw new Error(`No manifest.json found in ${moduleName}`);
      }
      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

      if (type === "checks") {
        checkManifestSchema.parse(raw);
        // Validate entrypoint exists
        const entrypointPath = path.join(destDir, raw.entrypoint);
        if (!fs.existsSync(entrypointPath)) {
          fs.rmSync(destDir, { recursive: true, force: true });
          throw new Error(
            `Check module "${moduleName}" declares entrypoint "${raw.entrypoint}" but file not found`
          );
        }
      } else if (type === "criteria") {
        criterionManifestSchema.parse(raw);
      } else if (type === "policies") {
        validatePolicyManifest(raw);
      }

      // Compile check modules
      if (type === "checks") {
        compileCheckModule(destDir);
      }

      // Lock
      const version = raw.version ?? "0.0.0";
      lockModule(arosDir, moduleName, {
        source: source.name,
        path: moduleName,
        sha,
        version,
        lockedAt: new Date().toISOString(),
      });

      found = true;

      // Resolve transitive dependencies for policies
      if (type === "policies" && raw.requires) {
        const missingDeps: string[] = [];
        for (const check of raw.requires.checks ?? []) {
          try {
            await addModule(projectDir, `checks/${check}`, options);
          } catch {
            missingDeps.push(`checks/${check}`);
          }
        }
        for (const criterion of raw.requires.criteria ?? []) {
          try {
            await addModule(projectDir, `criteria/${criterion}`, options);
          } catch {
            missingDeps.push(`criteria/${criterion}`);
          }
        }
        if (missingDeps.length > 0) {
          console.warn(
            `Policy "${moduleName}" installed but has unmet dependencies: ${missingDeps.join(", ")}`
          );
        }
      }

      break; // found in this source
    } catch (e: any) {
      if (e.message?.includes("No commits found")) continue; // try next source
      throw e;
    }
  }

  if (!found) {
    throw new Error(
      `Module "${moduleName}" not found in any configured source`
    );
  }
}
