import { describe, it, expect } from "vitest";
import {
  checkManifestSchema,
  criterionManifestSchema,
  policyManifestSchema,
} from "../modules/schemas.js";

describe("checkManifestSchema", () => {
  it("validates a valid check manifest", () => {
    const result = checkManifestSchema.safeParse({
      name: "word-count",
      type: "check",
      version: "1.0.0",
      description: "Word count check",
      supportedTypes: ["text/*"],
      configSchema: {},
      dependencies: { binaries: [], env: [], npm: [] },
      entrypoint: "check.ts",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing supportedTypes", () => {
    const result = checkManifestSchema.safeParse({
      name: "bad",
      type: "check",
      version: "1.0.0",
      description: "Bad",
      configSchema: {},
      dependencies: { binaries: [], env: [], npm: [] },
      entrypoint: "check.ts",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing entrypoint", () => {
    const result = checkManifestSchema.safeParse({
      name: "bad",
      type: "check",
      version: "1.0.0",
      description: "Bad",
      supportedTypes: ["text/*"],
      configSchema: {},
      dependencies: { binaries: [], env: [], npm: [] },
    });
    expect(result.success).toBe(false);
  });
});

describe("criterionManifestSchema", () => {
  it("validates a valid criterion manifest", () => {
    const result = criterionManifestSchema.safeParse({
      name: "tone-alignment",
      type: "criterion",
      version: "1.0.0",
      description: "Tone check",
      applicableTo: ["text/*"],
      defaultWeight: 2,
      scale: 10,
      promptGuidance: "Check tone alignment",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing promptGuidance", () => {
    const result = criterionManifestSchema.safeParse({
      name: "bad",
      type: "criterion",
      version: "1.0.0",
      description: "Bad",
      applicableTo: ["text/*"],
      defaultWeight: 2,
      scale: 10,
    });
    expect(result.success).toBe(false);
  });
});

describe("policyManifestSchema", () => {
  it("validates a valid policy manifest", () => {
    const result = policyManifestSchema.safeParse({
      name: "blog-post",
      type: "policy",
      version: "1.0.0",
      description: "Blog post review",
      requires: { checks: ["word-count"], criteria: ["tone-alignment"] },
      policy: {
        name: "blog-post",
        stages: ["objective", "subjective", "human"],
        max_revisions: 3,
        objective: {
          checks: [{ name: "word-count", config: { min: 800 }, severity: "blocking" }],
          fail_threshold: 1,
        },
        subjective: {
          criteria: [{ name: "tone-alignment", weight: 3, scale: 10 }],
          pass_threshold: 7.0,
        },
        human: { required: true },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts feedback_chips", () => {
    const result = policyManifestSchema.safeParse({
      name: "blog-post",
      type: "policy",
      version: "1.0.0",
      description: "Blog post review",
      feedback_chips: [
        { label: "Improve tone", category: "tone", severity: "major" },
        { label: "Fix accuracy", category: "accuracy", severity: "critical" },
        { label: "Too long", category: "length", severity: "minor" },
      ],
      requires: { checks: ["word-count"], criteria: ["tone-alignment"] },
      policy: {
        name: "blog-post",
        stages: ["objective", "subjective", "human"],
        max_revisions: 3,
        objective: {
          checks: [{ name: "word-count", config: { min: 800 }, severity: "blocking" }],
          fail_threshold: 1,
        },
        subjective: {
          criteria: [{ name: "tone-alignment", weight: 3, scale: 10 }],
          pass_threshold: 7.0,
        },
        human: { required: true },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.feedback_chips).toHaveLength(3);
      expect(result.data.feedback_chips![0]).toEqual({
        label: "Improve tone",
        category: "tone",
        severity: "major",
      });
    }
  });

  it("rejects feedback_chips with invalid severity", () => {
    const result = policyManifestSchema.safeParse({
      name: "blog-post",
      type: "policy",
      version: "1.0.0",
      description: "Blog post review",
      feedback_chips: [
        { label: "Bad", category: "bad", severity: "invalid" },
      ],
      requires: { checks: [], criteria: [] },
      policy: {
        name: "blog-post",
        stages: ["objective"],
        max_revisions: 3,
      },
    });
    expect(result.success).toBe(false);
  });

  it("allows omitting feedback_chips", () => {
    const result = policyManifestSchema.safeParse({
      name: "blog-post",
      type: "policy",
      version: "1.0.0",
      description: "Blog post review",
      requires: { checks: ["word-count"], criteria: ["tone-alignment"] },
      policy: {
        name: "blog-post",
        stages: ["objective"],
        max_revisions: 3,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.feedback_chips).toBeUndefined();
    }
  });

  it("rejects policy name mismatch", () => {
    const result = policyManifestSchema.safeParse({
      name: "blog-post",
      type: "policy",
      version: "1.0.0",
      description: "Blog post review",
      requires: { checks: [], criteria: [] },
      policy: {
        name: "WRONG-NAME",
        stages: ["objective"],
        max_revisions: 3,
      },
    });
    // The schema itself doesn't enforce name match — that's a refinement
    // But the validate function does
    expect(result.success).toBe(true); // parse succeeds
  });
});

describe("policy name consistency", () => {
  it("validatePolicyManifest rejects name mismatch", async () => {
    const { validatePolicyManifest } = await import("../modules/schemas.js");
    expect(() =>
      validatePolicyManifest({
        name: "blog-post",
        type: "policy",
        version: "1.0.0",
        description: "Blog post review",
        requires: { checks: [], criteria: [] },
        policy: { name: "WRONG", stages: ["objective"], max_revisions: 3 },
      })
    ).toThrow(/name mismatch/i);
  });
});
