import { describe, it, expect } from "vitest";
import { policyManifestSchema } from "../modules/schemas.js";

describe("policyManifestSchema usage_hint", () => {
  const basePolicy = {
    name: "test",
    type: "policy",
    version: "1.0.0",
    description: "Test policy",
    requires: { checks: [], criteria: [] },
    policy: {
      name: "test",
      stages: ["objective"],
      max_revisions: 1,
    },
  };

  it("accepts a policy with usage_hint", () => {
    const result = policyManifestSchema.parse({
      ...basePolicy,
      usage_hint: "Use for landing pages and product pages.",
    });
    expect(result.usage_hint).toBe("Use for landing pages and product pages.");
  });

  it("accepts a policy without usage_hint (optional)", () => {
    const result = policyManifestSchema.parse(basePolicy);
    expect(result.usage_hint).toBeUndefined();
  });
});
