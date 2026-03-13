import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import type { Storage } from "../storage.js";
import { badRequest, notFound, conflict } from "../errors.js";
import { criterionManifestSchema } from "../modules/schemas.js";

export function criteriaRoutes(storage: Storage): Router {
  const router = Router();

  function criteriaDir(): string {
    return path.join(storage.projectDir, ".aros", "modules", "criteria");
  }

  // GET / — list all custom criteria modules
  router.get("/", async (_req, res, next) => {
    try {
      const dir = criteriaDir();
      if (!fs.existsSync(dir)) {
        res.json([]);
        return;
      }
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const criteria = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(dir, entry.name, "manifest.json");
        if (!fs.existsSync(manifestPath)) continue;
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          criteria.push(manifest);
        } catch {
          // skip malformed
        }
      }
      res.json(criteria);
    } catch (err) {
      next(err);
    }
  });

  // POST / — create custom criterion
  router.post("/", async (req, res, next) => {
    try {
      const body = req.body;
      const parsed = criterionManifestSchema.parse(body);
      const dir = path.join(criteriaDir(), parsed.name);
      if (fs.existsSync(dir)) {
        throw conflict(`Criterion '${parsed.name}' already exists`);
      }
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "manifest.json"),
        JSON.stringify(parsed, null, 2)
      );
      res.status(201).json(parsed);
    } catch (err) {
      next(err);
    }
  });

  // PUT /:name — update custom criterion
  router.put("/:name", async (req, res, next) => {
    try {
      const { name } = req.params;
      const dir = path.join(criteriaDir(), name);
      const manifestPath = path.join(dir, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        throw notFound(`Criterion '${name}' not found`);
      }
      const body = req.body;
      const parsed = criterionManifestSchema.parse(body);
      fs.writeFileSync(manifestPath, JSON.stringify(parsed, null, 2));
      res.json(parsed);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:name — delete custom criterion
  router.delete("/:name", async (req, res, next) => {
    try {
      const { name } = req.params;
      const dir = path.join(criteriaDir(), name);
      if (!fs.existsSync(dir)) {
        throw notFound(`Criterion '${name}' not found`);
      }
      fs.rmSync(dir, { recursive: true });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
