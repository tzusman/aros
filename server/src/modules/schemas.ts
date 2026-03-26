import { z } from "zod";

// ---- Shared fields ----

const baseManifest = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string(),
});

// ---- Check manifest ----

const binaryDep = z.object({
  name: z.string(),
  versionCheck: z.string(),
  minVersion: z.string().optional(),
  install: z.record(z.string()).optional(),
});

const envDep = z.object({
  name: z.string(),
  required: z.boolean().default(true),
  description: z.string().optional(),
});

const npmDep = z.object({
  name: z.string(),
  minVersion: z.string().optional(),
});

const dependencies = z.object({
  binaries: z.array(binaryDep).default([]),
  env: z.array(envDep).default([]),
  npm: z.array(npmDep).default([]),
});

export const checkManifestSchema = baseManifest.extend({
  type: z.literal("check"),
  supportedTypes: z.array(z.string()).min(1),
  configSchema: z.record(z.unknown()).default({}),
  dependencies: dependencies,
  entrypoint: z.string(),
});

export type CheckManifest = z.infer<typeof checkManifestSchema>;

// ---- Criterion manifest ----

export const criterionManifestSchema = baseManifest.extend({
  type: z.literal("criterion"),
  applicableTo: z.array(z.string()).min(1),
  defaultWeight: z.number().positive(),
  scale: z.number().positive(),
  promptGuidance: z.string().min(1),
});

export type CriterionManifest = z.infer<typeof criterionManifestSchema>;

// ---- Policy manifest ----

const policyCheckEntry = z.object({
  name: z.string(),
  config: z.record(z.unknown()).default({}),
  severity: z.enum(["blocking", "warning"]),
});

const policyCriterionEntry = z.object({
  name: z.string(),
  description: z.string().optional(),
  weight: z.number().positive(),
  scale: z.number().positive(),
});

const policyBody = z.object({
  name: z.string(),
  stages: z.array(z.string()).min(1),
  max_revisions: z.number().int().min(0),
  objective: z
    .object({
      checks: z.array(policyCheckEntry),
      fail_threshold: z.number().int().min(1),
    })
    .optional(),
  subjective: z
    .object({
      criteria: z.array(policyCriterionEntry),
      pass_threshold: z.number(),
    })
    .optional(),
  human: z.object({ required: z.boolean() }).optional(),
});

const feedbackChip = z.object({
  label: z.string().min(1),
  category: z.string().min(1),
  severity: z.enum(["critical", "major", "minor"]),
});

export const policyManifestSchema = baseManifest.extend({
  type: z.literal("policy"),
  usage_hint: z.string().optional(),
  feedback_chips: z.array(feedbackChip).optional(),
  requires: z.object({
    checks: z.array(z.string()).default([]),
    criteria: z.array(z.string()).default([]),
  }),
  policy: policyBody,
});

export type PolicyManifest = z.infer<typeof policyManifestSchema>;

// ---- Validation helpers ----

export function validatePolicyManifest(data: unknown): PolicyManifest {
  const parsed = policyManifestSchema.parse(data);
  if (parsed.name !== parsed.policy.name) {
    throw new Error(
      `Policy name mismatch: outer name "${parsed.name}" does not match policy.name "${parsed.policy.name}"`
    );
  }
  return parsed;
}
