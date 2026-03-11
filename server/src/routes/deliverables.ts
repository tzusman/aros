import { Router } from "express";
import type { Storage } from "../storage.js";
import type { PipelineEngine } from "../pipeline/engine.js";
import type { DecisionPayload } from "@aros/types";

export function deliverableRoutes(
  storage: Storage,
  engine: PipelineEngine,
  apiBaseUrl: string
): Router {
  const router = Router();

  // GET / — list deliverables, optional ?stage= filter
  router.get("/", async (req, res, next) => {
    try {
      const stage = req.query["stage"] as string | undefined;
      const filter = stage ? { stage: stage as import("@aros/types").Stage } : undefined;
      const deliverables = await storage.listReviews(filter);
      res.json(deliverables);
    } catch (err) {
      next(err);
    }
  });

  // GET /:id — full deliverable
  router.get("/:id", async (req, res, next) => {
    try {
      const { id } = req.params;
      const deliverable = await storage.getFullDeliverable(id, apiBaseUrl);
      res.json(deliverable);
    } catch (err) {
      next(err);
    }
  });

  // POST /:id/decision — call engine.decide(id, payload), return 204
  router.post("/:id/decision", async (req, res, next) => {
    try {
      const { id } = req.params;
      const payload = req.body as DecisionPayload;
      await engine.decide(id, payload);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
