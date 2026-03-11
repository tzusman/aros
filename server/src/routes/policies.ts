import { Router } from "express";
import type { Storage } from "../storage.js";
import type { PolicyConfig } from "@aros/types";

export function policyRoutes(storage: Storage): Router {
  const router = Router();

  // GET / — list policies (name, stages, max_revisions summary)
  router.get("/", async (_req, res, next) => {
    try {
      const names = await storage.listPolicies();
      const policies = await Promise.all(
        names.map(async (name) => {
          const policy = await storage.readPolicy(name);
          return {
            name: policy.name,
            stages: policy.stages,
            max_revisions: policy.max_revisions,
          };
        })
      );
      res.json(policies);
    } catch (err) {
      next(err);
    }
  });

  // GET /:name — single policy
  router.get("/:name", async (req, res, next) => {
    try {
      const { name } = req.params;
      const policy = await storage.readPolicy(name);
      res.json(policy);
    } catch (err) {
      next(err);
    }
  });

  // PUT /:name — write policy, 204
  router.put("/:name", async (req, res, next) => {
    try {
      const { name } = req.params;
      const policy = req.body as PolicyConfig;
      await storage.writePolicy(name, policy);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:name — delete policy, 204
  router.delete("/:name", async (req, res, next) => {
    try {
      const { name } = req.params;
      await storage.deletePolicy(name);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
