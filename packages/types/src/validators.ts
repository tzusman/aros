import { z } from "zod";
import {
  STAGES,
  FOLDER_STRATEGIES,
  DECISIONS,
  SEVERITIES,
  FEEDBACK_SEVERITIES,
  NOTIFICATION_EVENTS,
} from "./constants.js";

// ---- Deliverable creation ----

export const createReviewSchema = z.object({
  title: z.string().min(1),
  brief: z.string().min(1),
  policy: z.string().default("default"),
  source_agent: z.string().min(1),
  content_type: z.string().min(1),
  folder_strategy: z.enum(FOLDER_STRATEGIES).optional(),
  notification: z
    .object({
      driver: z.string(),
      target: z.record(z.unknown()),
      events: z.array(z.enum(NOTIFICATION_EVENTS)),
    })
    .optional(),
});
export type CreateReview = z.infer<typeof createReviewSchema>;

// ---- Decision ----

export const decisionPayloadSchema = z.object({
  decision: z.enum(DECISIONS),
  reason: z.string().optional(),
});
export type DecisionPayload = z.infer<typeof decisionPayloadSchema>;

// ---- Policy ----

export const policyObjectiveCheckSchema = z.object({
  name: z.string().min(1),
  config: z.record(z.unknown()),
  severity: z.enum(SEVERITIES),
});

export const policySubjectiveCriterionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  weight: z.number().positive(),
  scale: z.number().positive(),
});

export const policyConfigSchema = z.object({
  name: z.string().min(1),
  stages: z.array(z.enum(STAGES)),
  max_revisions: z.number().int().positive(),
  objective: z
    .object({
      checks: z.array(policyObjectiveCheckSchema),
      fail_threshold: z.number().int().min(0),
    })
    .optional(),
  subjective: z
    .object({
      criteria: z.array(policySubjectiveCriterionSchema),
      pass_threshold: z.number().min(0),
    })
    .optional(),
  human: z.object({ required: z.boolean() }).optional(),
});
export type PolicyConfigInput = z.infer<typeof policyConfigSchema>;

// ---- File addition ----

export const addFileSchema = z.object({
  filename: z.string().min(1),
  content: z.string(),
  content_type: z.string().min(1),
  encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
});
export type AddFileInput = z.infer<typeof addFileSchema>;

// ---- List filter ----

export const listReviewsFilterSchema = z.object({
  stage: z.enum(STAGES).optional(),
  source_agent: z.string().optional(),
});
export type ListReviewsFilter = z.infer<typeof listReviewsFilterSchema>;
