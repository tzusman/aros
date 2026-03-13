import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import type { Storage } from "../storage.js";
import { notFound, badRequest } from "../errors.js";

interface RegistryModule {
  name: string;
  type: "check" | "criterion" | "policy";
  version: string;
  description: string;
  [key: string]: unknown;
}

function findRegistryDir(): string | null {
  // Walk up from this file to find the repo root's registry/ folder
  const here = new URL(".", import.meta.url).pathname;
  const candidates = [
    path.resolve(here, "../../registry"),
    path.resolve(here, "../../../registry"),
    path.resolve(here, "../../../../registry"),
    path.resolve(here, "../../../../../registry"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function readModulesFromDir(dir: string, type: string): RegistryModule[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const modules: RegistryModule[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(dir, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      modules.push({ ...manifest, type });
    } catch {
      // skip malformed
    }
  }
  return modules;
}

export function registryRoutes(storage: Storage): Router {
  const router = Router();

  // GET / — list all available modules in the registry
  router.get("/", async (_req, res, next) => {
    try {
      const registryDir = findRegistryDir();
      if (!registryDir) {
        res.json({ checks: [], criteria: [], policies: [] });
        return;
      }
      const checks = readModulesFromDir(path.join(registryDir, "checks"), "check");
      const criteria = readModulesFromDir(path.join(registryDir, "criteria"), "criterion");
      const policies = readModulesFromDir(path.join(registryDir, "policies"), "policy");
      res.json({ checks, criteria, policies });
    } catch (err) {
      next(err);
    }
  });

  // GET /checks — list checks
  router.get("/checks", async (_req, res, next) => {
    try {
      const registryDir = findRegistryDir();
      if (!registryDir) { res.json([]); return; }
      res.json(readModulesFromDir(path.join(registryDir, "checks"), "check"));
    } catch (err) { next(err); }
  });

  // GET /criteria — list criteria
  router.get("/criteria", async (_req, res, next) => {
    try {
      const registryDir = findRegistryDir();
      if (!registryDir) { res.json([]); return; }
      res.json(readModulesFromDir(path.join(registryDir, "criteria"), "criterion"));
    } catch (err) { next(err); }
  });

  // GET /policies — list policies
  router.get("/policies", async (_req, res, next) => {
    try {
      const registryDir = findRegistryDir();
      if (!registryDir) { res.json([]); return; }
      res.json(readModulesFromDir(path.join(registryDir, "policies"), "policy"));
    } catch (err) { next(err); }
  });

  // GET /policies/:name — get a single policy with full details
  router.get("/policies/:name", async (req, res, next) => {
    try {
      const registryDir = findRegistryDir();
      if (!registryDir) throw notFound("Registry not found");
      const manifestPath = path.join(registryDir, "policies", req.params.name, "manifest.json");
      if (!fs.existsSync(manifestPath)) throw notFound(`Policy '${req.params.name}' not found`);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      res.json(manifest);
    } catch (err) { next(err); }
  });

  // POST /install — install a policy and all its dependencies
  router.post("/install", async (req, res, next) => {
    try {
      const { policy: policyName } = req.body as { policy: string };
      if (!policyName) throw badRequest("Missing 'policy' in request body");

      const registryDir = findRegistryDir();
      if (!registryDir) throw notFound("Registry not found");

      const policyManifestPath = path.join(registryDir, "policies", policyName, "manifest.json");
      if (!fs.existsSync(policyManifestPath)) {
        throw notFound(`Policy '${policyName}' not found in registry`);
      }

      const policyManifest = JSON.parse(fs.readFileSync(policyManifestPath, "utf-8"));
      const installed: { type: string; name: string }[] = [];

      // Install required checks
      const requiredChecks: string[] = policyManifest.requires?.checks ?? [];
      for (const checkName of requiredChecks) {
        const checkDir = path.join(registryDir, "checks", checkName);
        if (!fs.existsSync(checkDir)) continue;
        const destDir = path.join(storage.projectDir, ".aros", "modules", "checks", checkName);
        copyDirRecursive(checkDir, destDir);
        installed.push({ type: "check", name: checkName });
      }

      // Install required criteria
      const requiredCriteria: string[] = policyManifest.requires?.criteria ?? [];
      for (const criterionName of requiredCriteria) {
        const criterionDir = path.join(registryDir, "criteria", criterionName);
        if (!fs.existsSync(criterionDir)) continue;
        const destDir = path.join(storage.projectDir, ".aros", "modules", "criteria", criterionName);
        copyDirRecursive(criterionDir, destDir);
        installed.push({ type: "criterion", name: criterionName });
      }

      // Install the policy itself — write the policy config to .aros/policies/
      const policyConfig = policyManifest.policy;
      if (policyConfig) {
        await storage.writePolicy(policyName, policyConfig);
        installed.push({ type: "policy", name: policyName });
      }

      // Also copy the full policy manifest to modules/policies/
      const policyDestDir = path.join(storage.projectDir, ".aros", "modules", "policies", policyName);
      copyDirRecursive(path.join(registryDir, "policies", policyName), policyDestDir);

      res.json({
        message: `Installed policy '${policyName}' with ${installed.length} modules`,
        installed,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  if (!fs.existsSync(src)) return;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
