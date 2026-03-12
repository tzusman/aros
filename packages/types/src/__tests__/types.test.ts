import { describe, it, expectTypeOf } from "vitest";
import type {
  ObjectiveCheck,
  CheckModule,
  CheckContext,
  CheckResult,
  FileEntry,
  CriterionDef,
  PolicySubjectiveCriterion,
} from "../index.js";

describe("ObjectiveCheck extended fields", () => {
  it("has file and suggestions fields", () => {
    // file and suggestions are optional — existing code without them still compiles
    const minimal: ObjectiveCheck = {
      name: "test",
      passed: true,
      severity: "blocking",
      details: "ok",
    };
    const full: ObjectiveCheck = {
      name: "test",
      passed: true,
      severity: "blocking",
      details: "ok",
      file: "readme.md",
      suggestions: ["do this"],
    };
    expectTypeOf(full.file).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(full.suggestions).toEqualTypeOf<string[] | undefined>();
  });
});

describe("CheckModule interface", () => {
  it("has execute method returning CheckResult[]", () => {
    const mod: CheckModule = {
      execute: async (ctx: CheckContext) => {
        return [{ name: "test", file: null, passed: true, details: "ok" }];
      },
    };
    expectTypeOf(mod.execute).toBeFunction();
  });
});

describe("CriterionDef interface", () => {
  it("has all required fields", () => {
    const def: CriterionDef = {
      name: "tone",
      description: "Tone check",
      applicableTo: ["text/*"],
      defaultWeight: 2,
      scale: 10,
      promptGuidance: "Check tone",
    };
    expectTypeOf(def.promptGuidance).toBeString();
  });
});

describe("PolicySubjectiveCriterion description is optional", () => {
  it("allows omitting description", () => {
    const criterion: PolicySubjectiveCriterion = {
      name: "tone",
      weight: 2,
      scale: 10,
    };
    expectTypeOf(criterion.description).toEqualTypeOf<string | undefined>();
  });
});
