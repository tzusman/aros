import { Router } from "express";
import type { Storage } from "../storage.js";
import type { PipelineCounts } from "@aros/types";

export function pipelineRoutes(storage: Storage): Router {
  const router = Router();

  // GET /counts — compute PipelineCounts from storage.listReviews()
  router.get("/counts", async (_req, res, next) => {
    try {
      const reviews = await storage.listReviews();

      const now = Date.now();
      const ms72h = 72 * 60 * 60 * 1000;

      const counts: PipelineCounts = {
        in_progress: 0,
        pending_human: 0,
        awaiting_revisions: 0,
        approved_72h: 0,
        rejected_72h: 0,
      };

      for (const review of reviews) {
        const { stage } = review;

        if (stage === "human") {
          counts.pending_human++;
        } else if (stage === "revision_requested") {
          counts.awaiting_revisions++;
        } else if (stage === "objective" || stage === "subjective" || stage === "draft") {
          counts.in_progress++;
        } else if (stage === "approved") {
          const enteredAt = new Date(review.entered_stage_at).getTime();
          if (now - enteredAt <= ms72h) {
            counts.approved_72h++;
          }
        } else if (stage === "rejected") {
          const enteredAt = new Date(review.entered_stage_at).getTime();
          if (now - enteredAt <= ms72h) {
            counts.rejected_72h++;
          }
        }
      }

      res.json(counts);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
