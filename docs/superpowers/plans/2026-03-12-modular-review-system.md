# Modular Review System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a module system where objective checks, subjective criteria, and review policies are distributable units pulled from GitHub repos and pinned via lockfile, replacing the current monolithic check functions.

**Architecture:** Three module types (checks, criteria, policies) stored in `.aros/modules/`, fetched from configurable GitHub source repos via git sparse checkout, and pinned in `.aros/lock.json`. Check modules are compiled from TypeScript to JavaScript via esbuild at install time. The pipeline engine loads compiled modules and criteria manifests at startup.

**Tech Stack:** TypeScript, Zod 3.x (manifest validation), esbuild (module compilation), simple-git or child_process git (sparse checkout), Commander.js (CLI commands), @clack/prompts (interactive install)

**Spec:** `docs/superpowers/specs/2026-03-12-modular-review-system-design.md`

**Existing code to modify:**
- `packages/types/src/index.ts` — extend `ObjectiveCheck`, add module interfaces, make `PolicySubjectiveCriterion.description` optional
- `server/src/storage.ts` — make `projectDir` public, add `.aros/` init
- `server/src/pipeline/objective.ts` — refactor to use check-loader
- `server/src/pipeline/engine.ts` — use module-aware check/criteria loading
- `cli/src/index.ts` — add `registry` and `module` subcommands

---

## Chunk 1: Shared Types + Manifest Schemas

### Task 1: Extend Shared Types

Update the types package with new interfaces for the module system.

**Files:**
- Modify: `packages/types/src/index.ts`
- Test: `packages/types/src/__tests__/types.test.ts` (new)

- [ ] **Step 1: Write type assertion test**

Create `packages/types/src/__tests__/types.test.ts`:

```typescript
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
```

- [ ] **Step 2: Add vitest to types package**

Add to `packages/types/package.json` devDependencies: `"vitest": "^3.2.0"` and scripts: `"test": "vitest run"`.

Run: `pnpm install`

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @aros/types test
```

Expected: Fails — `CheckModule`, `CheckContext`, `CheckResult`, `FileEntry`, `CriterionDef` do not exist.

- [ ] **Step 4: Add new types and extend existing ones**

Edit `packages/types/src/index.ts`. Add to existing `ObjectiveCheck`:

```typescript
export interface ObjectiveCheck {
  name: string;
  passed: boolean;
  severity: "blocking" | "warning";
  details: string;
  file?: string | null;          // NEW: optional — which file this applies to
  suggestions?: string[];       // NEW: actionable suggestions
}
```

Make `PolicySubjectiveCriterion.description` optional:

```typescript
export interface PolicySubjectiveCriterion {
  name: string;
  description?: string;  // optional when using module criteria
  weight: number;
  scale: number;
}
```

Add new interfaces at the bottom:

```typescript
// ---- Module System ----

export interface FileEntry {
  filename: string;
  content: string | Buffer;
  contentType: string;
  sizeBytes: number;
}

export interface CheckContext {
  files: FileEntry[];
  config: Record<string, unknown>;
  brief: string;
  projectDir: string;
}

export interface CheckResult {
  name: string;
  file: string | null;
  passed: boolean;
  details: string;
  suggestions?: string[];
}

export interface CheckModule {
  execute(ctx: CheckContext): Promise<CheckResult[]>;
}

export interface CriterionDef {
  name: string;
  description: string;
  applicableTo: string[];
  defaultWeight: number;
  scale: number;
  promptGuidance: string;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @aros/types test
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/types/
git commit -m "feat(types): add module system interfaces and extend ObjectiveCheck"
```

---

### Task 2: Manifest Validation Schemas

Zod schemas for validating check, criterion, and policy manifests fetched from remote repos.

**Files:**
- Create: `server/src/modules/schemas.ts`
- Create: `server/src/__tests__/schemas.test.ts`

- [ ] **Step 1: Write schema tests**

Create `server/src/__tests__/schemas.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aros/server test -- src/__tests__/schemas.test.ts
```

Expected: Fails — module not found.

- [ ] **Step 3: Implement schemas**

Create `server/src/modules/schemas.ts`:

```typescript
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

export const policyManifestSchema = baseManifest.extend({
  type: z.literal("policy"),
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @aros/server test -- src/__tests__/schemas.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/schemas.ts server/src/__tests__/schemas.test.ts
git commit -m "feat(server): add Zod manifest validation schemas for check, criterion, policy modules"
```

---

## Chunk 2: Module Loader + Check Registry

### Task 3: MIME Glob Matching Utility

A utility function for matching content types against patterns like `text/*`, `image/*`, `*/*`.

**Files:**
- Create: `server/src/modules/mime-match.ts`
- Create: `server/src/__tests__/mime-match.test.ts`

- [ ] **Step 1: Write test**

Create `server/src/__tests__/mime-match.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { matchMime } from "../modules/mime-match.js";

describe("matchMime", () => {
  it("matches exact types", () => {
    expect(matchMime("text/markdown", "text/markdown")).toBe(true);
    expect(matchMime("text/markdown", "text/plain")).toBe(false);
  });

  it("matches wildcard subtypes", () => {
    expect(matchMime("text/markdown", "text/*")).toBe(true);
    expect(matchMime("text/plain", "text/*")).toBe(true);
    expect(matchMime("image/png", "text/*")).toBe(false);
  });

  it("matches universal wildcard", () => {
    expect(matchMime("text/markdown", "*/*")).toBe(true);
    expect(matchMime("image/png", "*/*")).toBe(true);
  });

  it("matches image types", () => {
    expect(matchMime("image/png", "image/*")).toBe(true);
    expect(matchMime("image/jpeg", "image/*")).toBe(true);
    expect(matchMime("text/plain", "image/*")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aros/server test -- src/__tests__/mime-match.test.ts
```

- [ ] **Step 3: Implement**

Create `server/src/modules/mime-match.ts`:

```typescript
/**
 * Match a content type against a MIME pattern.
 * Patterns: "text/markdown" (exact), "text/*" (wildcard subtype), "*/*" (all).
 */
export function matchMime(contentType: string, pattern: string): boolean {
  if (pattern === "*/*") return true;
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, pattern.indexOf("/"));
    return contentType.startsWith(prefix + "/");
  }
  return contentType === pattern;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @aros/server test -- src/__tests__/mime-match.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/mime-match.ts server/src/__tests__/mime-match.test.ts
git commit -m "feat(server): add MIME glob matching utility"
```

---

### Task 4: Check Loader

Loads compiled check modules from `.aros/modules/checks/`.

**Files:**
- Create: `server/src/modules/check-loader.ts`
- Create: `server/src/__tests__/check-loader.test.ts`

- [ ] **Step 1: Write test**

Create `server/src/__tests__/check-loader.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadCheck, loadAllChecks, loadCheckManifest } from "../modules/check-loader.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-check-loader-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeModule(name: string, manifest: object, jsCode: string) {
  const dir = path.join(tmpDir, "checks", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, "check.js"), jsCode);
}

describe("loadCheckManifest", () => {
  it("reads and validates manifest.json", () => {
    writeModule("word-count", {
      name: "word-count",
      type: "check",
      version: "1.0.0",
      description: "Word count",
      supportedTypes: ["text/*"],
      configSchema: {},
      dependencies: { binaries: [], env: [], npm: [] },
      entrypoint: "check.ts",
    }, "export default { execute: async () => [] };");

    const manifest = loadCheckManifest(tmpDir, "word-count");
    expect(manifest.name).toBe("word-count");
    expect(manifest.supportedTypes).toEqual(["text/*"]);
  });
});

describe("loadCheck", () => {
  it("loads a compiled check module", async () => {
    writeModule("simple", {
      name: "simple",
      type: "check",
      version: "1.0.0",
      description: "Simple",
      supportedTypes: ["text/*"],
      configSchema: {},
      dependencies: { binaries: [], env: [], npm: [] },
      entrypoint: "check.ts",
    }, `export default { execute: async (ctx) => [{ name: "simple", file: null, passed: true, details: "ok" }] };`);

    const mod = await loadCheck("simple", tmpDir);
    const results = await mod.execute({ files: [], config: {}, brief: "", projectDir: tmpDir });
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });
});

describe("loadAllChecks", () => {
  it("loads all checks from directory", async () => {
    writeModule("a", {
      name: "a", type: "check", version: "1.0.0", description: "A",
      supportedTypes: ["text/*"], configSchema: {},
      dependencies: { binaries: [], env: [], npm: [] }, entrypoint: "check.ts",
    }, `export default { execute: async () => [{ name: "a", file: null, passed: true, details: "ok" }] };`);

    writeModule("b", {
      name: "b", type: "check", version: "1.0.0", description: "B",
      supportedTypes: ["image/*"], configSchema: {},
      dependencies: { binaries: [], env: [], npm: [] }, entrypoint: "check.ts",
    }, `export default { execute: async () => [{ name: "b", file: null, passed: true, details: "ok" }] };`);

    const checks = await loadAllChecks(tmpDir);
    expect(checks.size).toBe(2);
    expect(checks.has("a")).toBe(true);
    expect(checks.has("b")).toBe(true);
  });

  it("returns empty map if directory does not exist", async () => {
    const checks = await loadAllChecks(path.join(tmpDir, "nonexistent"));
    expect(checks.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aros/server test -- src/__tests__/check-loader.test.ts
```

- [ ] **Step 3: Implement**

Create `server/src/modules/check-loader.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import type { CheckModule } from "@aros/types";
import { checkManifestSchema, type CheckManifest } from "./schemas.js";

export function loadCheckManifest(modulesDir: string, name: string): CheckManifest {
  const manifestPath = path.join(modulesDir, "checks", name, "manifest.json");
  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  return checkManifestSchema.parse(raw);
}

export async function loadCheck(name: string, modulesDir: string): Promise<CheckModule> {
  const entrypoint = path.join(modulesDir, "checks", name, "check.js");
  const mod = await import(pathToFileURL(entrypoint).href);
  return mod.default;
}

export async function loadAllChecks(modulesDir: string): Promise<Map<string, CheckModule>> {
  const checks = new Map<string, CheckModule>();
  const checksDir = path.join(modulesDir, "checks");
  if (!fs.existsSync(checksDir)) return checks;
  for (const entry of fs.readdirSync(checksDir)) {
    const stat = fs.statSync(path.join(checksDir, entry));
    if (!stat.isDirectory()) continue;
    const jsPath = path.join(checksDir, entry, "check.js");
    if (!fs.existsSync(jsPath)) continue;
    checks.set(entry, await loadCheck(entry, modulesDir));
  }
  return checks;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @aros/server test -- src/__tests__/check-loader.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/check-loader.ts server/src/__tests__/check-loader.test.ts
git commit -m "feat(server): add check module loader"
```

---

### Task 5: Criteria Loader

Loads criterion manifests from `.aros/modules/criteria/`.

**Files:**
- Create: `server/src/modules/criteria-loader.ts`
- Create: `server/src/__tests__/criteria-loader.test.ts`

- [ ] **Step 1: Write test**

Create `server/src/__tests__/criteria-loader.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadCriteriaLibrary } from "../modules/criteria-loader.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-criteria-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeCriterion(name: string, manifest: object) {
  const dir = path.join(tmpDir, "criteria", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
}

describe("loadCriteriaLibrary", () => {
  it("loads all criteria from directory", () => {
    writeCriterion("tone-alignment", {
      name: "tone-alignment",
      type: "criterion",
      version: "1.0.0",
      description: "Tone check",
      applicableTo: ["text/*"],
      defaultWeight: 2,
      scale: 10,
      promptGuidance: "Check tone",
    });
    writeCriterion("visual-quality", {
      name: "visual-quality",
      type: "criterion",
      version: "1.0.0",
      description: "Visual quality",
      applicableTo: ["image/*"],
      defaultWeight: 3,
      scale: 10,
      promptGuidance: "Check visual quality",
    });

    const library = loadCriteriaLibrary(tmpDir);
    expect(library.size).toBe(2);
    expect(library.get("tone-alignment")!.applicableTo).toEqual(["text/*"]);
    expect(library.get("visual-quality")!.promptGuidance).toBe("Check visual quality");
  });

  it("returns empty map if directory does not exist", () => {
    const library = loadCriteriaLibrary(path.join(tmpDir, "nonexistent"));
    expect(library.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aros/server test -- src/__tests__/criteria-loader.test.ts
```

- [ ] **Step 3: Implement**

Create `server/src/modules/criteria-loader.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import type { CriterionDef } from "@aros/types";
import { criterionManifestSchema } from "./schemas.js";

export function loadCriteriaLibrary(modulesDir: string): Map<string, CriterionDef> {
  const library = new Map<string, CriterionDef>();
  const criteriaDir = path.join(modulesDir, "criteria");
  if (!fs.existsSync(criteriaDir)) return library;
  for (const entry of fs.readdirSync(criteriaDir)) {
    const manifestPath = path.join(criteriaDir, entry, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const parsed = criterionManifestSchema.parse(raw);
    library.set(parsed.name, {
      name: parsed.name,
      description: parsed.description,
      applicableTo: parsed.applicableTo,
      defaultWeight: parsed.defaultWeight,
      scale: parsed.scale,
      promptGuidance: parsed.promptGuidance,
    });
  }
  return library;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @aros/server test -- src/__tests__/criteria-loader.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/criteria-loader.ts server/src/__tests__/criteria-loader.test.ts
git commit -m "feat(server): add criteria library loader"
```

---

## Chunk 3: Subjective Prompt Builder + Response Parser

### Task 6: Subjective Prompt Builder

Assembles Claude API prompts from criteria library definitions and policy weights.

**Files:**
- Create: `server/src/modules/subjective/prompt-builder.ts`
- Create: `server/src/__tests__/prompt-builder.test.ts`

- [ ] **Step 1: Write test**

Create `server/src/__tests__/prompt-builder.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildSubjectivePrompt } from "../modules/subjective/prompt-builder.js";
import type { CriterionDef } from "@aros/types";

const library = new Map<string, CriterionDef>([
  ["tone", {
    name: "tone",
    description: "Tone alignment",
    applicableTo: ["text/*"],
    defaultWeight: 2,
    scale: 10,
    promptGuidance: "Check if tone matches brief",
  }],
  ["visual", {
    name: "visual",
    description: "Visual quality",
    applicableTo: ["image/*"],
    defaultWeight: 3,
    scale: 10,
    promptGuidance: "Check visual appeal",
  }],
]);

describe("buildSubjectivePrompt", () => {
  it("builds prompt for text files with matching criteria", () => {
    const result = buildSubjectivePrompt(
      [{ filename: "post.md", content: "# Hello", contentType: "text/markdown", sizeBytes: 7 }],
      "Write a blog post",
      [{ name: "tone", weight: 3, scale: 10 }],
      library
    );
    expect(result.messages).toHaveLength(1);
    const text = result.messages[0].content.find((b: any) => b.type === "text" && b.text.includes("evaluation_criteria"));
    expect(text).toBeDefined();
    expect((text as any).text).toContain("tone");
    expect((text as any).text).toContain("Check if tone matches brief");
  });

  it("builds prompt for image files with vision blocks", () => {
    const result = buildSubjectivePrompt(
      [{ filename: "hero.png", content: "base64data", contentType: "image/png", sizeBytes: 100 }],
      "Create a hero image",
      [{ name: "visual", weight: 2, scale: 10 }],
      library
    );
    const imageBlock = result.messages[0].content.find((b: any) => b.type === "image");
    expect(imageBlock).toBeDefined();
  });

  it("returns valid JSON instruction in prompt", () => {
    const result = buildSubjectivePrompt(
      [{ filename: "post.md", content: "# Hello", contentType: "text/markdown", sizeBytes: 7 }],
      "Write a blog post",
      [{ name: "tone", weight: 3, scale: 10 }],
      library
    );
    const evalBlock = result.messages[0].content.find(
      (b: any) => b.type === "text" && b.text.includes('"scores"')
    );
    expect(evalBlock).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aros/server test -- src/__tests__/prompt-builder.test.ts
```

- [ ] **Step 3: Implement**

Create `server/src/modules/subjective/prompt-builder.ts`:

```typescript
import type { CriterionDef, FileEntry, PolicySubjectiveCriterion } from "@aros/types";

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicImageBlock {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
}

export interface SubjectivePromptResult {
  system: string;
  messages: AnthropicMessage[];
}

export function buildSubjectivePrompt(
  files: FileEntry[],
  brief: string,
  policyCriteria: PolicySubjectiveCriterion[],
  library: Map<string, CriterionDef>
): SubjectivePromptResult {
  const contentBlocks: AnthropicContentBlock[] = [];

  for (const file of files) {
    if (file.contentType.startsWith("image/")) {
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: file.contentType,
          data: file.content as string,
        },
      });
    } else {
      contentBlocks.push({
        type: "text",
        text: `<file name="${file.filename}">\n${file.content}\n</file>`,
      });
    }
  }

  const criteriaBlock = policyCriteria
    .map((pc, i) => {
      const def = library.get(pc.name);
      const description = pc.description ?? def?.description ?? "Evaluate this criterion.";
      const guidance = def?.promptGuidance ?? "";
      return `### ${i + 1}. ${pc.name} (weight: ${pc.weight}, scale: ${pc.scale})\n${description}\n${guidance}`;
    })
    .join("\n\n");

  contentBlocks.push({
    type: "text",
    text: `<brief>\n${brief}\n</brief>

<evaluation_criteria>
${criteriaBlock}
</evaluation_criteria>

Evaluate this deliverable against each criterion above.
Return a JSON object with this exact structure:
{
  "scores": [
    { "name": "criterion_name", "score": <number>, "rationale": "<2-3 sentences>" }
  ]
}`,
  });

  return {
    system:
      "You are a content quality reviewer. Evaluate the deliverable against the given criteria. Return only valid JSON.",
    messages: [{ role: "user", content: contentBlocks }],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @aros/server test -- src/__tests__/prompt-builder.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/subjective/ server/src/__tests__/prompt-builder.test.ts
git commit -m "feat(server): add subjective prompt builder with criteria library integration"
```

---

### Task 7: Response Parser + Score Computation

Parse Claude's JSON response and compute weighted scores.

**Files:**
- Create: `server/src/modules/subjective/response-parser.ts`
- Create: `server/src/__tests__/response-parser.test.ts`

- [ ] **Step 1: Write test**

Create `server/src/__tests__/response-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  extractJSON,
  parseSubjectiveResponse,
  computeWeightedScore,
} from "../modules/subjective/response-parser.js";

describe("extractJSON", () => {
  it("parses raw JSON", () => {
    const result = extractJSON('{"scores": []}');
    expect(result.scores).toEqual([]);
  });

  it("extracts JSON from markdown code block", () => {
    const result = extractJSON('Here is the evaluation:\n```json\n{"scores": [{"name": "tone", "score": 8, "rationale": "good"}]}\n```');
    expect(result.scores).toHaveLength(1);
  });

  it("throws on unparseable text", () => {
    expect(() => extractJSON("no json here")).toThrow(/could not extract/i);
  });
});

describe("parseSubjectiveResponse", () => {
  it("maps scores to SubjectiveCriterion with policy weights", () => {
    const responseText = JSON.stringify({
      scores: [
        { name: "tone", score: 8, rationale: "Good tone" },
        { name: "clarity", score: 6, rationale: "Needs work" },
      ],
    });
    const criteria = [
      { name: "tone", weight: 3, scale: 10 },
      { name: "clarity", weight: 2, scale: 10 },
    ];
    const result = parseSubjectiveResponse(responseText, criteria);
    expect(result).toHaveLength(2);
    expect(result[0].weight).toBe(3);
    expect(result[1].score).toBe(6);
    expect(result[1].rationale).toBe("Needs work");
  });
});

describe("computeWeightedScore", () => {
  it("computes normalized weighted average on 0-10 scale", () => {
    const scores = [
      { name: "a", score: 8, weight: 3, scale: 10, rationale: "" },
      { name: "b", score: 6, weight: 2, scale: 10, rationale: "" },
    ];
    // (8/10*10*3 + 6/10*10*2) / (3+2) = (24+12)/5 = 7.2
    expect(computeWeightedScore(scores)).toBe(7.2);
  });

  it("normalizes different scales", () => {
    const scores = [
      { name: "a", score: 4, weight: 1, scale: 5, rationale: "" },
      { name: "b", score: 8, weight: 1, scale: 10, rationale: "" },
    ];
    // (4/5*10*1 + 8/10*10*1) / (1+1) = (8+8)/2 = 8.0
    expect(computeWeightedScore(scores)).toBe(8.0);
  });

  it("returns 0 for empty scores", () => {
    expect(computeWeightedScore([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aros/server test -- src/__tests__/response-parser.test.ts
```

- [ ] **Step 3: Implement**

Create `server/src/modules/subjective/response-parser.ts`:

```typescript
import type { SubjectiveCriterion, PolicySubjectiveCriterion } from "@aros/types";

/**
 * Extract JSON from Claude's response. Handles:
 * 1. Raw JSON string
 * 2. Markdown ```json ... ``` code blocks
 */
export function extractJSON(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) return JSON.parse(match[1].trim());
    throw new Error("Could not extract JSON from response");
  }
}

export function parseSubjectiveResponse(
  responseText: string,
  policyCriteria: PolicySubjectiveCriterion[]
): SubjectiveCriterion[] {
  const json = extractJSON(responseText);
  return json.scores.map((s: any) => {
    const pc = policyCriteria.find((c) => c.name === s.name);
    return {
      name: s.name,
      score: s.score,
      weight: pc?.weight ?? 1,
      scale: pc?.scale ?? 10,
      rationale: s.rationale,
    };
  });
}

/**
 * Compute normalized weighted score on 0-10 scale.
 * Each score is normalized by its scale before weighting.
 */
export function computeWeightedScore(scores: SubjectiveCriterion[]): number {
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = scores.reduce(
    (sum, s) => sum + (s.score / s.scale) * 10 * s.weight,
    0
  );
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @aros/server test -- src/__tests__/response-parser.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/subjective/response-parser.ts server/src/__tests__/response-parser.test.ts
git commit -m "feat(server): add subjective response parser and weighted score computation"
```

---

## Chunk 4: Module Compiler + Storage Init Changes

### Task 8: Module Compiler

Compiles check.ts to check.js using esbuild.

**Files:**
- Create: `server/src/modules/compile.ts`
- Create: `server/src/__tests__/compile.test.ts`

- [ ] **Step 1: Write test**

Create `server/src/__tests__/compile.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { compileCheckModule } from "../modules/compile.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-compile-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("compileCheckModule", () => {
  it("compiles check.ts to check.js", () => {
    fs.writeFileSync(
      path.join(tmpDir, "check.ts"),
      `import { join } from "node:path";
export default {
  async execute(ctx: any) {
    return [{ name: "test", file: null, passed: true, details: join("a", "b") }];
  }
};`
    );
    compileCheckModule(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "check.js"))).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, "check.js"), "utf-8");
    expect(content).toContain("execute");
  });

  it("skips if no check.ts exists", () => {
    compileCheckModule(tmpDir); // should not throw
    expect(fs.existsSync(path.join(tmpDir, "check.js"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aros/server test -- src/__tests__/compile.test.ts
```

- [ ] **Step 3: Add esbuild dependency**

Add `"esbuild": "^0.25.0"` to `server/package.json` dependencies. Run `pnpm install`.

- [ ] **Step 4: Implement**

Create `server/src/modules/compile.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { buildSync } from "esbuild";

export function compileCheckModule(modulePath: string): void {
  const entrypoint = path.join(modulePath, "check.ts");
  if (!fs.existsSync(entrypoint)) return;
  buildSync({
    entryPoints: [entrypoint],
    outfile: path.join(modulePath, "check.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    external: ["node:*"],
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @aros/server test -- src/__tests__/compile.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/compile.ts server/src/__tests__/compile.test.ts server/package.json
git commit -m "feat(server): add esbuild check module compiler"
```

---

### Task 9: Storage Init Changes

Make `projectDir` public and add `.aros/` directory initialization.

**Files:**
- Modify: `server/src/storage.ts`
- Modify: `server/src/__tests__/storage.test.ts`

- [ ] **Step 1: Write tests for new init behavior**

Add to `server/src/__tests__/storage.test.ts`:

```typescript
describe("init creates .aros directory", () => {
  it("creates registry.json with default official source", () => {
    storage.init();
    const registryPath = path.join(tmpDir, ".aros", "registry.json");
    expect(fs.existsSync(registryPath)).toBe(true);
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
    expect(registry.sources).toHaveLength(1);
    expect(registry.sources[0].name).toBe("official");
  });

  it("creates empty lock.json", () => {
    storage.init();
    const lockPath = path.join(tmpDir, ".aros", "lock.json");
    expect(fs.existsSync(lockPath)).toBe(true);
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(lock.version).toBe(1);
    expect(lock.locked).toEqual({});
  });

  it("creates modules subdirectories", () => {
    storage.init();
    expect(fs.existsSync(path.join(tmpDir, ".aros", "modules", "checks"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".aros", "modules", "criteria"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".aros", "modules", "policies"))).toBe(true);
  });
});

describe("projectDir is accessible", () => {
  it("exposes projectDir as public readonly", () => {
    expect(storage.projectDir).toBe(tmpDir);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aros/server test -- src/__tests__/storage.test.ts
```

Expected: Fails — `projectDir` is private, `.aros/` dirs not created.

- [ ] **Step 3: Update Storage class**

In `server/src/storage.ts`, change `private projectDir` to `public readonly projectDir`:

```typescript
export class Storage {
  public readonly projectDir: string;
```

In the `init()` method, add `.aros/` initialization after existing directory creation:

```typescript
  // Module system directories
  const arosDir = path.join(this.projectDir, ".aros");
  fs.mkdirSync(path.join(arosDir, "modules", "checks"), { recursive: true });
  fs.mkdirSync(path.join(arosDir, "modules", "criteria"), { recursive: true });
  fs.mkdirSync(path.join(arosDir, "modules", "policies"), { recursive: true });

  const registryPath = path.join(arosDir, "registry.json");
  if (!fs.existsSync(registryPath)) {
    fs.writeFileSync(registryPath, JSON.stringify({
      sources: [{
        name: "official",
        url: "https://github.com/aros-project/modules.git",
        branch: "main",
      }],
    }, null, 2));
  }

  const lockPath = path.join(arosDir, "lock.json");
  if (!fs.existsSync(lockPath)) {
    fs.writeFileSync(lockPath, JSON.stringify({ version: 1, locked: {} }, null, 2));
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @aros/server test -- src/__tests__/storage.test.ts
```

Expected: PASS (all existing tests + new ones)

- [ ] **Step 5: Commit**

```bash
git add server/src/storage.ts server/src/__tests__/storage.test.ts
git commit -m "feat(server): make projectDir public, add .aros/ init with registry and lockfile"
```

---

## Chunk 5: Registry + Lockfile Management

### Task 10: Registry and Lockfile Data Layer

Read/write registry.json and lock.json.

**Files:**
- Create: `server/src/modules/registry.ts`
- Create: `server/src/__tests__/registry.test.ts`

- [ ] **Step 1: Write test**

Create `server/src/__tests__/registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  readRegistry,
  writeRegistry,
  addSource,
  removeSource,
  readLockfile,
  writeLockfile,
  lockModule,
  unlockModule,
} from "../modules/registry.js";

let arosDir: string;

beforeEach(() => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-registry-"));
  arosDir = path.join(tmpDir, ".aros");
  fs.mkdirSync(arosDir, { recursive: true });
  fs.writeFileSync(
    path.join(arosDir, "registry.json"),
    JSON.stringify({ sources: [{ name: "official", url: "https://github.com/aros-project/modules.git", branch: "main" }] })
  );
  fs.writeFileSync(
    path.join(arosDir, "lock.json"),
    JSON.stringify({ version: 1, locked: {} })
  );
});

afterEach(() => {
  fs.rmSync(path.dirname(arosDir), { recursive: true, force: true });
});

describe("registry", () => {
  it("reads sources", () => {
    const reg = readRegistry(arosDir);
    expect(reg.sources).toHaveLength(1);
    expect(reg.sources[0].name).toBe("official");
  });

  it("adds a source", () => {
    addSource(arosDir, { name: "company", url: "https://github.com/acme/modules.git", branch: "main" });
    const reg = readRegistry(arosDir);
    expect(reg.sources).toHaveLength(2);
    expect(reg.sources[1].name).toBe("company");
  });

  it("prevents duplicate source names", () => {
    expect(() =>
      addSource(arosDir, { name: "official", url: "https://other.git", branch: "main" })
    ).toThrow(/already exists/i);
  });

  it("removes a source", () => {
    addSource(arosDir, { name: "company", url: "https://github.com/acme/modules.git", branch: "main" });
    removeSource(arosDir, "company");
    const reg = readRegistry(arosDir);
    expect(reg.sources).toHaveLength(1);
  });
});

describe("lockfile", () => {
  it("reads empty lockfile", () => {
    const lock = readLockfile(arosDir);
    expect(lock.locked).toEqual({});
  });

  it("locks a module", () => {
    lockModule(arosDir, "checks/word-count", {
      source: "official",
      path: "checks/word-count",
      sha: "abc123",
      version: "1.0.0",
      lockedAt: "2026-03-12T00:00:00Z",
    });
    const lock = readLockfile(arosDir);
    expect(lock.locked["checks/word-count"].sha).toBe("abc123");
  });

  it("unlocks a module", () => {
    lockModule(arosDir, "checks/word-count", {
      source: "official",
      path: "checks/word-count",
      sha: "abc123",
      version: "1.0.0",
      lockedAt: "2026-03-12T00:00:00Z",
    });
    unlockModule(arosDir, "checks/word-count");
    const lock = readLockfile(arosDir);
    expect(lock.locked["checks/word-count"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aros/server test -- src/__tests__/registry.test.ts
```

- [ ] **Step 3: Implement**

Create `server/src/modules/registry.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

// ---- Types ----

export interface RegistrySource {
  name: string;
  url: string;
  branch: string;
}

export interface Registry {
  sources: RegistrySource[];
}

export interface LockEntry {
  source: string;
  path: string;
  sha: string;
  version: string;
  lockedAt: string;
}

export interface Lockfile {
  version: number;
  locked: Record<string, LockEntry>;
}

// ---- Registry ----

export function readRegistry(arosDir: string): Registry {
  return JSON.parse(fs.readFileSync(path.join(arosDir, "registry.json"), "utf-8"));
}

export function writeRegistry(arosDir: string, registry: Registry): void {
  fs.writeFileSync(path.join(arosDir, "registry.json"), JSON.stringify(registry, null, 2));
}

export function addSource(arosDir: string, source: RegistrySource): void {
  const registry = readRegistry(arosDir);
  if (registry.sources.some((s) => s.name === source.name)) {
    throw new Error(`Source "${source.name}" already exists`);
  }
  registry.sources.push(source);
  writeRegistry(arosDir, registry);
}

export function removeSource(arosDir: string, name: string): void {
  const registry = readRegistry(arosDir);
  registry.sources = registry.sources.filter((s) => s.name !== name);
  writeRegistry(arosDir, registry);
}

// ---- Lockfile ----

export function readLockfile(arosDir: string): Lockfile {
  return JSON.parse(fs.readFileSync(path.join(arosDir, "lock.json"), "utf-8"));
}

export function writeLockfile(arosDir: string, lockfile: Lockfile): void {
  fs.writeFileSync(path.join(arosDir, "lock.json"), JSON.stringify(lockfile, null, 2));
}

export function lockModule(arosDir: string, key: string, entry: LockEntry): void {
  const lockfile = readLockfile(arosDir);
  lockfile.locked[key] = entry;
  writeLockfile(arosDir, lockfile);
}

export function unlockModule(arosDir: string, key: string): void {
  const lockfile = readLockfile(arosDir);
  delete lockfile.locked[key];
  writeLockfile(arosDir, lockfile);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @aros/server test -- src/__tests__/registry.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/registry.ts server/src/__tests__/registry.test.ts
git commit -m "feat(server): add registry and lockfile read/write layer"
```

---

## Chunk 6: Git Fetch + Module Add

### Task 11: Git Module Fetcher

Fetches a module from a git repo at a specific path and SHA using sparse checkout.

**Files:**
- Create: `server/src/modules/git-fetch.ts`
- Create: `server/src/__tests__/git-fetch.test.ts`

- [ ] **Step 1: Write test**

Create `server/src/__tests__/git-fetch.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fetchModuleFromGit, getLatestSha } from "../modules/git-fetch.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-git-fetch-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Integration tests that use a real local git repo as a source
describe("fetchModuleFromGit", () => {
  let repoDir: string;

  beforeEach(() => {
    // Create a local git repo to use as source
    repoDir = path.join(tmpDir, "source-repo");
    fs.mkdirSync(path.join(repoDir, "checks", "word-count"), { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, "checks", "word-count", "manifest.json"),
      JSON.stringify({ name: "word-count", type: "check", version: "1.0.0" })
    );
    fs.writeFileSync(
      path.join(repoDir, "checks", "word-count", "check.ts"),
      'export default { execute: async () => [] };'
    );
    const { execSync } = require("child_process");
    execSync("git init && git add -A && git commit -m init", { cwd: repoDir, stdio: "pipe" });
  });

  it("fetches a module directory to a destination", async () => {
    const destDir = path.join(tmpDir, "dest");
    fs.mkdirSync(destDir, { recursive: true });
    const sha = await getLatestSha(repoDir, "main", "checks/word-count");
    await fetchModuleFromGit(repoDir, "checks/word-count", sha, path.join(destDir, "checks", "word-count"));
    expect(fs.existsSync(path.join(destDir, "checks", "word-count", "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(destDir, "checks", "word-count", "check.ts"))).toBe(true);
  });
});

describe("getLatestSha", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = path.join(tmpDir, "sha-repo");
    fs.mkdirSync(path.join(repoDir, "checks", "test"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, "checks", "test", "manifest.json"), "{}");
    const { execSync } = require("child_process");
    execSync("git init && git add -A && git commit -m init", { cwd: repoDir, stdio: "pipe" });
  });

  it("returns the HEAD sha", async () => {
    const sha = await getLatestSha(repoDir, "main", "checks/test");
    expect(sha).toMatch(/^[a-f0-9]{40}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aros/server test -- src/__tests__/git-fetch.test.ts
```

- [ ] **Step 3: Implement**

Create `server/src/modules/git-fetch.ts`:

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const exec = promisify(execFile);

const CACHE_DIR = path.join(os.homedir(), ".cache", "aros", "repos");

/**
 * Ensure we have a local clone of the repo, return the local path.
 * For local paths, returns as-is. For remote URLs, clones/fetches to cache.
 */
async function ensureLocalRepo(repoUrl: string, branch: string): Promise<string> {
  // If it's a local directory, use directly
  if (fs.existsSync(path.join(repoUrl, ".git")) || fs.existsSync(path.join(repoUrl, "HEAD"))) {
    return repoUrl;
  }

  // Hash the URL to get a stable cache dir name
  const hash = Buffer.from(repoUrl).toString("base64url").slice(0, 32);
  const cacheDir = path.join(CACHE_DIR, hash);

  if (fs.existsSync(path.join(cacheDir, "HEAD"))) {
    // Already cloned — fetch latest
    await exec("git", ["fetch", "origin", branch], { cwd: cacheDir });
  } else {
    // Fresh clone — bare clone to save space
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    await exec("git", ["clone", "--bare", "--single-branch", "--branch", branch, repoUrl, cacheDir]);
  }

  return cacheDir;
}

/**
 * Get the latest commit SHA that touched a given path on a branch.
 */
export async function getLatestSha(
  repoUrl: string,
  branch: string,
  modulePath: string
): Promise<string> {
  const localRepo = await ensureLocalRepo(repoUrl, branch);
  const { stdout } = await exec("git", [
    "log",
    "-1",
    "--format=%H",
    `origin/${branch}`,
    "--",
    modulePath,
  ], { cwd: localRepo });
  const sha = stdout.trim();
  if (!sha) throw new Error(`No commits found for path "${modulePath}" on branch "${branch}" in ${repoUrl}`);
  return sha;
}

/**
 * Fetch a module directory from a git repo at a specific SHA.
 * Clones remote repos to a local cache, then uses git archive to extract.
 */
export async function fetchModuleFromGit(
  repoUrl: string,
  modulePath: string,
  sha: string,
  destDir: string
): Promise<void> {
  const localRepo = await ensureLocalRepo(repoUrl, "main");
  const tmpArchive = path.join(os.tmpdir(), `aros-fetch-${Date.now()}.tar`);
  fs.mkdirSync(destDir, { recursive: true });

  try {
    await exec("git", [
      "archive",
      "--format=tar",
      "-o", tmpArchive,
      sha,
      "--",
      modulePath,
    ], { cwd: localRepo });

    const depth = modulePath.split("/").length;
    await exec("tar", [
      "-xf", tmpArchive,
      "-C", destDir,
      `--strip-components=${depth}`,
    ]);
  } finally {
    if (fs.existsSync(tmpArchive)) fs.unlinkSync(tmpArchive);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @aros/server test -- src/__tests__/git-fetch.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/git-fetch.ts server/src/__tests__/git-fetch.test.ts
git commit -m "feat(server): add git-based module fetcher with sparse archive extraction"
```

---

### Task 12: Module Add Logic

The core `addModule` function: search sources, fetch, validate, compile, lock.

**Files:**
- Create: `server/src/modules/add.ts`
- Create: `server/src/__tests__/add.test.ts`

- [ ] **Step 1: Write test**

Create `server/src/__tests__/add.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { addModule } from "../modules/add.js";

let projectDir: string;
let sourceRepoDir: string;

beforeEach(() => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-add-"));
  projectDir = path.join(tmpDir, "project");
  sourceRepoDir = path.join(tmpDir, "source");

  // Set up project .aros dir
  const arosDir = path.join(projectDir, ".aros");
  fs.mkdirSync(path.join(arosDir, "modules", "checks"), { recursive: true });
  fs.mkdirSync(path.join(arosDir, "modules", "criteria"), { recursive: true });
  fs.mkdirSync(path.join(arosDir, "modules", "policies"), { recursive: true });

  // Set up source repo with a check module
  fs.mkdirSync(path.join(sourceRepoDir, "checks", "word-count"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRepoDir, "checks", "word-count", "manifest.json"),
    JSON.stringify({
      name: "word-count", type: "check", version: "1.0.0",
      description: "Word count", supportedTypes: ["text/*"],
      configSchema: {}, dependencies: { binaries: [], env: [], npm: [] },
      entrypoint: "check.ts",
    })
  );
  fs.writeFileSync(
    path.join(sourceRepoDir, "checks", "word-count", "check.ts"),
    'export default { execute: async () => [{ name: "word-count", file: null, passed: true, details: "ok" }] };'
  );

  // Set up source repo with a criterion
  fs.mkdirSync(path.join(sourceRepoDir, "criteria", "tone"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRepoDir, "criteria", "tone", "manifest.json"),
    JSON.stringify({
      name: "tone", type: "criterion", version: "1.0.0",
      description: "Tone check", applicableTo: ["text/*"],
      defaultWeight: 2, scale: 10, promptGuidance: "Check tone",
    })
  );

  const { execSync } = require("child_process");
  execSync("git init && git add -A && git commit -m init", { cwd: sourceRepoDir, stdio: "pipe" });

  // Write registry pointing to source repo
  fs.writeFileSync(
    path.join(arosDir, "registry.json"),
    JSON.stringify({ sources: [{ name: "local", url: sourceRepoDir, branch: "main" }] })
  );
  fs.writeFileSync(
    path.join(arosDir, "lock.json"),
    JSON.stringify({ version: 1, locked: {} })
  );
});

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true });
});

describe("addModule", () => {
  it("fetches a check module, compiles it, and locks it", async () => {
    await addModule(projectDir, "checks/word-count");

    // Check files exist
    const modDir = path.join(projectDir, ".aros", "modules", "checks", "word-count");
    expect(fs.existsSync(path.join(modDir, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(modDir, "check.js"))).toBe(true); // compiled

    // Check lockfile updated
    const lock = JSON.parse(
      fs.readFileSync(path.join(projectDir, ".aros", "lock.json"), "utf-8")
    );
    expect(lock.locked["checks/word-count"]).toBeDefined();
    expect(lock.locked["checks/word-count"].source).toBe("local");
  });

  it("fetches a criterion module (no compilation needed)", async () => {
    await addModule(projectDir, "criteria/tone");

    const modDir = path.join(projectDir, ".aros", "modules", "criteria", "tone");
    expect(fs.existsSync(path.join(modDir, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(modDir, "check.js"))).toBe(false); // no code

    const lock = JSON.parse(
      fs.readFileSync(path.join(projectDir, ".aros", "lock.json"), "utf-8")
    );
    expect(lock.locked["criteria/tone"]).toBeDefined();
  });

  it("throws if module not found in any source", async () => {
    await expect(addModule(projectDir, "checks/nonexistent")).rejects.toThrow(
      /not found/i
    );
  });

  it("resolves transitive policy dependencies", async () => {
    // Add a policy that requires the word-count check and tone criterion
    const { execSync } = require("child_process");
    fs.mkdirSync(path.join(sourceRepoDir, "policies", "test-policy"), { recursive: true });
    fs.writeFileSync(
      path.join(sourceRepoDir, "policies", "test-policy", "manifest.json"),
      JSON.stringify({
        name: "test-policy", type: "policy", version: "1.0.0",
        description: "Test policy",
        requires: { checks: ["word-count"], criteria: ["tone"] },
        policy: {
          name: "test-policy", stages: ["objective", "subjective"], max_revisions: 2,
          objective: { checks: [{ name: "word-count", config: {}, severity: "blocking" }], fail_threshold: 1 },
          subjective: { criteria: [{ name: "tone", weight: 2, scale: 10 }], pass_threshold: 7.0 },
        },
      })
    );
    execSync("git add -A && git commit -m 'add policy'", { cwd: sourceRepoDir, stdio: "pipe" });

    await addModule(projectDir, "policies/test-policy");

    const lock = JSON.parse(fs.readFileSync(path.join(projectDir, ".aros", "lock.json"), "utf-8"));
    expect(lock.locked["policies/test-policy"]).toBeDefined();
    expect(lock.locked["checks/word-count"]).toBeDefined();
    expect(lock.locked["criteria/tone"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aros/server test -- src/__tests__/add.test.ts
```

- [ ] **Step 3: Implement**

Create `server/src/modules/add.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { readRegistry, readLockfile, lockModule } from "./registry.js";
import { fetchModuleFromGit, getLatestSha } from "./git-fetch.js";
import { compileCheckModule } from "./compile.js";
import { checkManifestSchema, criterionManifestSchema, validatePolicyManifest } from "./schemas.js";

export async function addModule(
  projectDir: string,
  moduleName: string,
  options?: { source?: string }
): Promise<void> {
  const arosDir = path.join(projectDir, ".aros");
  const registry = readRegistry(arosDir);
  const lockfile = readLockfile(arosDir);

  // Already installed?
  if (lockfile.locked[moduleName]) {
    return; // skip
  }

  // Determine module type from path prefix
  const [type] = moduleName.split("/"); // "checks", "criteria", "policies"

  // Search sources in order
  const sourcesToSearch = options?.source
    ? registry.sources.filter((s) => s.name === options.source)
    : registry.sources;

  let found = false;

  for (const source of sourcesToSearch) {
    try {
      const sha = await getLatestSha(source.url, source.branch, moduleName);
      const destDir = path.join(arosDir, "modules", moduleName);

      await fetchModuleFromGit(source.url, moduleName, sha, destDir);

      // Validate manifest
      const manifestPath = path.join(destDir, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        throw new Error(`No manifest.json found in ${moduleName}`);
      }
      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

      if (type === "checks") {
        checkManifestSchema.parse(raw);
        // Validate entrypoint exists (spec Section 14.0 step 3)
        const entrypointPath = path.join(destDir, raw.entrypoint);
        if (!fs.existsSync(entrypointPath)) {
          fs.rmSync(destDir, { recursive: true, force: true });
          throw new Error(`Check module "${moduleName}" declares entrypoint "${raw.entrypoint}" but file not found`);
        }
      } else if (type === "criteria") {
        criterionManifestSchema.parse(raw);
      } else if (type === "policies") {
        validatePolicyManifest(raw);
      }

      // Compile check modules
      if (type === "checks") {
        compileCheckModule(destDir);
      }

      // Lock
      const version = raw.version ?? "0.0.0";
      lockModule(arosDir, moduleName, {
        source: source.name,
        path: moduleName,
        sha,
        version,
        lockedAt: new Date().toISOString(),
      });

      found = true;

      // Resolve transitive dependencies for policies
      const missingDeps: string[] = [];
      if (type === "policies" && raw.requires) {
        for (const check of raw.requires.checks ?? []) {
          try {
            await addModule(projectDir, `checks/${check}`, options);
          } catch {
            missingDeps.push(`checks/${check}`);
          }
        }
        for (const criterion of raw.requires.criteria ?? []) {
          try {
            await addModule(projectDir, `criteria/${criterion}`, options);
          } catch {
            missingDeps.push(`criteria/${criterion}`);
          }
        }
        if (missingDeps.length > 0) {
          console.warn(`Policy "${moduleName}" installed but has unmet dependencies: ${missingDeps.join(", ")}`);
        }
      }

      break; // found in this source
    } catch (e: any) {
      if (e.message?.includes("No commits found")) continue; // try next source
      throw e;
    }
  }

  if (!found) {
    throw new Error(`Module "${moduleName}" not found in any configured source`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @aros/server test -- src/__tests__/add.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/add.ts server/src/__tests__/add.test.ts
git commit -m "feat(server): add module add with fetch, validate, compile, and lock"
```

---

## Chunk 7: CLI Commands

### Task 13: CLI Registry Commands

Add `aros registry add/remove/list` commands to the CLI.

**Files:**
- Create: `cli/src/registry-cmd.ts`
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Implement registry commands**

Create `cli/src/registry-cmd.ts`:

```typescript
import * as path from "node:path";
import { Command } from "commander";
import { addSource, removeSource, readRegistry } from "@aros/server/modules/registry.js";

export function registryCommands(program: Command) {
  const registry = program.command("registry").description("Manage module source repos");

  registry
    .command("add <url>")
    .description("Add a source repo")
    .option("--name <name>", "Source name")
    .option("--branch <branch>", "Branch name", "main")
    .action((url: string, opts: { name?: string; branch: string }) => {
      const arosDir = path.join(process.cwd(), ".aros");
      const name = opts.name ?? url.split("/").pop()?.replace(".git", "") ?? "unnamed";
      addSource(arosDir, { name, url, branch: opts.branch });
      console.log(`Added source "${name}" → ${url} (${opts.branch})`);
    });

  registry
    .command("remove <name>")
    .description("Remove a source repo")
    .action((name: string) => {
      const arosDir = path.join(process.cwd(), ".aros");
      removeSource(arosDir, name);
      console.log(`Removed source "${name}"`);
    });

  registry
    .command("list")
    .description("List configured sources")
    .action(() => {
      const arosDir = path.join(process.cwd(), ".aros");
      const reg = readRegistry(arosDir);
      for (const s of reg.sources) {
        console.log(`  ${s.name}  ${s.url}  (${s.branch})`);
      }
    });
}
```

- [ ] **Step 2: Wire into CLI**

Edit `cli/src/index.ts` — add import and call after existing commands:

```typescript
import { registryCommands } from "./registry-cmd.js";
// ... after existing program setup ...
registryCommands(program);
```

- [ ] **Step 3: Update server package.json exports**

Add to `server/package.json` `exports`:

```json
"./modules/registry.js": { "types": "./dist/modules/registry.d.ts", "default": "./dist/modules/registry.js" },
"./modules/add.js": { "types": "./dist/modules/add.d.ts", "default": "./dist/modules/add.js" }
```

- [ ] **Step 4: Build and verify**

```bash
pnpm -r build
```

Expected: All packages compile without errors.

- [ ] **Step 5: Commit**

```bash
git add cli/src/registry-cmd.ts cli/src/index.ts server/package.json
git commit -m "feat(cli): add aros registry add/remove/list commands"
```

---

### Task 14: CLI Module Commands

Add `aros module add/remove/list/sync/check` commands.

**Files:**
- Create: `cli/src/module-cmd.ts`
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Implement module commands**

Create `cli/src/module-cmd.ts`:

```typescript
import * as path from "node:path";
import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { Command } from "commander";
import { addModule } from "@aros/server/modules/add.js";
import {
  readLockfile,
  readRegistry,
  unlockModule,
} from "@aros/server/modules/registry.js";
import { fetchModuleFromGit, getLatestSha } from "@aros/server/modules/git-fetch.js";
import { compileCheckModule } from "@aros/server/modules/compile.js";

export function moduleCommands(program: Command) {
  const mod = program.command("module").description("Manage review modules");

  mod
    .command("add <name>")
    .description("Add a module (e.g., checks/word-count, policies/blog-post)")
    .option("--source <source>", "Fetch from specific source")
    .action(async (name: string, opts: { source?: string }) => {
      const projectDir = process.cwd();
      console.log(`Adding ${name}...`);
      await addModule(projectDir, name, { source: opts.source });
      console.log(`✓ ${name} installed and locked`);
    });

  mod
    .command("remove <name>")
    .description("Remove an installed module")
    .action((name: string) => {
      const arosDir = path.join(process.cwd(), ".aros");
      const lock = readLockfile(arosDir);

      // Warn if any policies depend on this module
      for (const [key, _entry] of Object.entries(lock.locked)) {
        if (!key.startsWith("policies/")) continue;
        const policyManifestPath = path.join(arosDir, "modules", key, "manifest.json");
        if (!fs.existsSync(policyManifestPath)) continue;
        const policyManifest = JSON.parse(fs.readFileSync(policyManifestPath, "utf-8"));
        const allDeps = [
          ...(policyManifest.requires?.checks ?? []).map((c: string) => `checks/${c}`),
          ...(policyManifest.requires?.criteria ?? []).map((c: string) => `criteria/${c}`),
        ];
        if (allDeps.includes(name)) {
          console.warn(`⚠ Warning: policy "${key}" depends on "${name}"`);
        }
      }

      const modDir = path.join(arosDir, "modules", name);
      if (fs.existsSync(modDir)) {
        fs.rmSync(modDir, { recursive: true, force: true });
      }
      unlockModule(arosDir, name);
      console.log(`✓ ${name} removed`);
    });

  mod
    .command("list")
    .description("List installed modules")
    .action(() => {
      const arosDir = path.join(process.cwd(), ".aros");
      const lock = readLockfile(arosDir);
      const entries = Object.entries(lock.locked);
      if (entries.length === 0) {
        console.log("No modules installed. Run `aros module add <name>` to install.");
        return;
      }
      for (const [key, entry] of entries) {
        console.log(`  ${key}  v${entry.version}  (${entry.source} @ ${entry.sha.slice(0, 7)})`);
      }
    });

  mod
    .command("sync")
    .description("Fetch all modules from lockfile")
    .action(async () => {
      const projectDir = process.cwd();
      const arosDir = path.join(projectDir, ".aros");
      const lock = readLockfile(arosDir);
      const registry = readRegistry(arosDir);

      const entries = Object.entries(lock.locked);
      console.log(`Syncing ${entries.length} modules...`);

      for (const [key, entry] of entries) {
        const source = registry.sources.find((s) => s.name === entry.source);
        if (!source) {
          console.log(`  ✗ ${key} — source "${entry.source}" not configured`);
          continue;
        }
        const destDir = path.join(arosDir, "modules", key);
        if (fs.existsSync(destDir)) {
          fs.rmSync(destDir, { recursive: true, force: true });
        }
        await fetchModuleFromGit(source.url, entry.path, entry.sha, destDir);

        // Compile if it's a check module
        if (key.startsWith("checks/")) {
          compileCheckModule(destDir);
        }
        console.log(`  ✓ ${key} @ ${entry.sha.slice(0, 7)}`);
      }
      console.log("Done.");
    });

  mod
    .command("check")
    .description("Validate module dependencies")
    .action(() => {
      const arosDir = path.join(process.cwd(), ".aros");
      const modulesDir = path.join(arosDir, "modules");
      const checksDir = path.join(modulesDir, "checks");

      if (!fs.existsSync(checksDir)) {
        console.log("No check modules installed.");
        return;
      }

      for (const name of fs.readdirSync(checksDir)) {
        const manifestPath = path.join(checksDir, name, "manifest.json");
        if (!fs.existsSync(manifestPath)) continue;
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const deps = manifest.dependencies ?? {};

        let allGood = true;
        for (const bin of deps.binaries ?? []) {
          try {
            execSync(`which ${bin.name}`, { stdio: "pipe" });
            console.log(`  ✓ ${name}: ${bin.name} found`);
          } catch {
            console.log(`  ✗ ${name}: ${bin.name} not found — install with: ${bin.install?.macos ?? bin.install?.script ?? "unknown"}`);
            allGood = false;
          }
        }
        for (const npmDep of deps.npm ?? []) {
          try {
            execSync(`npm ls ${npmDep.name}`, { stdio: "pipe" });
            console.log(`  ✓ ${name}: npm ${npmDep.name} found`);
          } catch {
            console.log(`  ✗ ${name}: npm ${npmDep.name} not found${npmDep.minVersion ? ` (requires >=${npmDep.minVersion})` : ""}`);
            allGood = false;
          }
        }
        for (const env of deps.env ?? []) {
          if (process.env[env.name]) {
            console.log(`  ✓ ${name}: ${env.name} set`);
          } else if (env.required) {
            console.log(`  ✗ ${name}: ${env.name} not set (required)`);
            allGood = false;
          } else {
            console.log(`  ⚠ ${name}: ${env.name} not set (optional)`);
          }
        }
        if (allGood && (deps.binaries?.length || deps.env?.length || deps.npm?.length)) {
          console.log(`  ✓ ${name}: all dependencies satisfied`);
        }
      }
    });

  mod
    .command("update [name]")
    .description("Check for and apply module updates")
    .option("--all", "Update all modules without prompting")
    .option("--yes", "Auto-confirm (for CI)")
    .action(async (name?: string, opts?: { all?: boolean; yes?: boolean }) => {
      const projectDir = process.cwd();
      const arosDir = path.join(projectDir, ".aros");
      const lock = readLockfile(arosDir);
      const registry = readRegistry(arosDir);

      const entries = name
        ? [[name, lock.locked[name]] as const].filter(([, e]) => e)
        : Object.entries(lock.locked);

      if (entries.length === 0) {
        console.log(name ? `Module "${name}" not installed.` : "No modules installed.");
        return;
      }

      const updates: Array<{ key: string; oldSha: string; newSha: string; oldVersion: string; newVersion: string }> = [];

      for (const [key, entry] of entries) {
        const source = registry.sources.find((s) => s.name === entry.source);
        if (!source) continue;
        try {
          const latestSha = await getLatestSha(source.url, source.branch, entry.path);
          if (latestSha !== entry.sha) {
            // Peek at manifest for version
            const tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "aros-update-"));
            await fetchModuleFromGit(source.url, entry.path, latestSha, tmpDir);
            const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, "manifest.json"), "utf-8"));
            fs.rmSync(tmpDir, { recursive: true, force: true });
            updates.push({ key, oldSha: entry.sha, newSha: latestSha, oldVersion: entry.version, newVersion: manifest.version ?? entry.version });
          }
        } catch {
          console.log(`  ⚠ Could not check ${key} for updates`);
        }
      }

      if (updates.length === 0) {
        console.log("All modules are up to date.");
        return;
      }

      console.log(`\nUpdates available:`);
      for (const u of updates) {
        console.log(`  ${u.key}: v${u.oldVersion} → v${u.newVersion} (${u.oldSha.slice(0, 7)} → ${u.newSha.slice(0, 7)})`);
      }

      if (!opts?.all && !opts?.yes) {
        console.log("\nRun with --all --yes to apply, or update individual modules with: aros module update <name> --yes");
        return;
      }

      for (const u of updates) {
        const destDir = path.join(arosDir, "modules", u.key);
        const source = registry.sources.find((s) => s.name === lock.locked[u.key].source)!;
        if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
        await fetchModuleFromGit(source.url, lock.locked[u.key].path, u.newSha, destDir);
        if (u.key.startsWith("checks/")) compileCheckModule(destDir);
        lock.locked[u.key] = { ...lock.locked[u.key], sha: u.newSha, version: u.newVersion, lockedAt: new Date().toISOString() };
        console.log(`  ✓ ${u.key} updated to v${u.newVersion}`);
      }
      const { writeLockfile } = await import("@aros/server/modules/registry.js");
      writeLockfile(arosDir, lock);
      console.log("Lockfile updated.");
    });

  mod
    .command("rollback <name>")
    .description("Restore a module to its previous version from lockfile git history")
    .action(async (name: string) => {
      const projectDir = process.cwd();
      const arosDir = path.join(projectDir, ".aros");
      const lock = readLockfile(arosDir);

      if (!lock.locked[name]) {
        console.error(`Module "${name}" is not installed.`);
        process.exit(1);
      }

      // Find previous SHA from git history of lock.json
      try {
        const lockPath = path.join(arosDir, "lock.json");
        const logOutput = execSync(
          `git log --oneline -10 -- "${lockPath}"`,
          { cwd: projectDir, encoding: "utf-8" }
        );
        const commits = logOutput.trim().split("\n").filter(Boolean);
        if (commits.length < 2) {
          console.error("No previous version found in git history.");
          process.exit(1);
        }

        // Check the previous commit's lock.json for this module
        const prevCommit = commits[1].split(" ")[0];
        const prevLockContent = execSync(
          `git show ${prevCommit}:.aros/lock.json`,
          { cwd: projectDir, encoding: "utf-8" }
        );
        const prevLock = JSON.parse(prevLockContent);
        const prevEntry = prevLock.locked?.[name];

        if (!prevEntry || prevEntry.sha === lock.locked[name].sha) {
          console.error(`No different previous version found for "${name}".`);
          process.exit(1);
        }

        console.log(`Rolling back ${name}: ${lock.locked[name].sha.slice(0, 7)} → ${prevEntry.sha.slice(0, 7)} (v${prevEntry.version})`);

        const registry = readRegistry(arosDir);
        const source = registry.sources.find((s) => s.name === prevEntry.source);
        if (!source) {
          console.error(`Source "${prevEntry.source}" not configured.`);
          process.exit(1);
        }

        const destDir = path.join(arosDir, "modules", name);
        if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
        await fetchModuleFromGit(source.url, prevEntry.path, prevEntry.sha, destDir);
        if (name.startsWith("checks/")) compileCheckModule(destDir);

        const { lockModule: lockMod } = await import("@aros/server/modules/registry.js");
        lockMod(arosDir, name, { ...prevEntry, lockedAt: new Date().toISOString() });
        console.log(`✓ ${name} rolled back to v${prevEntry.version}`);
      } catch (e: any) {
        console.error(`Rollback failed: ${e.message}`);
        process.exit(1);
      }
    });
}
```

- [ ] **Step 2: Wire into CLI**

Edit `cli/src/index.ts` — add:

```typescript
import { moduleCommands } from "./module-cmd.js";
// ... after registryCommands(program) ...
moduleCommands(program);
```

- [ ] **Step 3: Update server exports**

Add remaining exports to `server/package.json`:

```json
"./modules/compile.js": { "types": "./dist/modules/compile.d.ts", "default": "./dist/modules/compile.js" },
"./modules/git-fetch.js": { "types": "./dist/modules/git-fetch.d.ts", "default": "./dist/modules/git-fetch.js" },
"./modules/schemas.js": { "types": "./dist/modules/schemas.d.ts", "default": "./dist/modules/schemas.js" },
"./modules/check-loader.js": { "types": "./dist/modules/check-loader.d.ts", "default": "./dist/modules/check-loader.js" },
"./modules/criteria-loader.js": { "types": "./dist/modules/criteria-loader.d.ts", "default": "./dist/modules/criteria-loader.js" },
"./modules/mime-match.js": { "types": "./dist/modules/mime-match.d.ts", "default": "./dist/modules/mime-match.js" },
"./modules/subjective/prompt-builder.js": { "types": "./dist/modules/subjective/prompt-builder.d.ts", "default": "./dist/modules/subjective/prompt-builder.js" },
"./modules/subjective/response-parser.js": { "types": "./dist/modules/subjective/response-parser.d.ts", "default": "./dist/modules/subjective/response-parser.js" }
```

- [ ] **Step 4: Build and verify**

```bash
pnpm -r build
```

Expected: All packages compile.

- [ ] **Step 5: Commit**

```bash
git add cli/src/module-cmd.ts cli/src/index.ts server/package.json
git commit -m "feat(cli): add aros module add/remove/list/sync/check/update/rollback commands"
```

---

## Chunk 8: Pipeline Engine Integration

### Task 15: Integrate Module System into Pipeline Engine

Update the existing pipeline engine to load check modules and criteria library on init, and use them during objective and subjective stages.

**Files:**
- Modify: `server/src/pipeline/engine.ts`
- Modify: `server/src/__tests__/engine.test.ts`

- [ ] **Step 1: Update engine to load modules on construction**

Edit `server/src/pipeline/engine.ts`. Add imports:

```typescript
import { loadAllChecks, loadCheckManifest } from "../modules/check-loader.js";
import { loadCriteriaLibrary } from "../modules/criteria-loader.js";
import { matchMime } from "../modules/mime-match.js";
import { buildSubjectivePrompt } from "../modules/subjective/prompt-builder.js";
import { parseSubjectiveResponse, computeWeightedScore } from "../modules/subjective/response-parser.js";
import type { CheckModule, CriterionDef, FileEntry } from "@aros/types";
```

Add module loading to constructor or a new `initModules()` method:

```typescript
private checkModules: Map<string, CheckModule> = new Map();
private criteriaLibrary: Map<string, CriterionDef> = new Map();

async initModules(): Promise<void> {
  const modulesDir = path.join(this.storage.projectDir, ".aros", "modules");
  this.checkModules = await loadAllChecks(modulesDir);
  this.criteriaLibrary = loadCriteriaLibrary(modulesDir);
}
```

- [ ] **Step 2: Update objective stage to use loaded modules**

In the `runObjective` method (or equivalent), when the engine has loaded check modules, use them instead of the hardcoded checks. The existing `runObjectiveChecks()` remains as fallback when no modules are installed:

```typescript
private async runObjectiveWithModules(id: string, policy: PolicyConfig): Promise<boolean> {
  const files = this.storage.listFiles(id);
  const brief = (await this.storage.readMeta(id)).brief;
  const modulesDir = path.join(this.storage.projectDir, ".aros", "modules");
  const results: ObjectiveCheck[] = [];

  for (const policyCheck of policy.objective?.checks ?? []) {
    const mod = this.checkModules.get(policyCheck.name);
    if (!mod) {
      // Fallback: module not installed, record as failure
      results.push({
        name: policyCheck.name,
        passed: false,
        severity: policyCheck.severity,
        details: `Module not installed: ${policyCheck.name}`,
        file: null,
      });
      continue;
    }

    // Filter files by module's supportedTypes
    // NOTE: storage.listFiles() may return empty content_type — use detectContentType()
    const manifest = loadCheckManifest(modulesDir, policyCheck.name);
    const fileEntries: FileEntry[] = [];
    for (const f of files) {
      const ct = f.content_type || detectContentType(f.filename);
      if (manifest.supportedTypes.some((p) => matchMime(ct, p))) {
        const data = this.storage.readFile(id, f.filename);
        fileEntries.push({
          filename: f.filename,
          content: data.content,
          contentType: ct,
          sizeBytes: f.size_bytes,
        });
      }
    }
    if (fileEntries.length === 0) continue; // skip — no applicable files

    const checkResults = await mod.execute({
      files: fileEntries,
      config: policyCheck.config ?? {},
      brief,
      projectDir: this.storage.projectDir,
    });

    for (const r of checkResults) {
      results.push({ ...r, severity: policyCheck.severity });
    }
  }

  await this.storage.writeObjectiveResults(id, results);

  const blockingFailures = results.filter((r) => !r.passed && r.severity === "blocking");
  const threshold = policy.objective?.fail_threshold ?? 1;
  if (blockingFailures.length >= threshold) {
    const allFailures = results.filter((r) => !r.passed);
    const feedback: Feedback = {
      stage: "objective",
      decision: "revision_requested",
      summary: `Objective checks failed: ${blockingFailures.length} blocking failure(s).`,
      issues: allFailures.map((r) => ({
        file: r.file ?? null,
        location: "",
        category: r.name,
        severity: r.severity === "blocking" ? "critical" : "minor",
        description: r.details,
        suggestion: r.suggestions?.[0] ?? "",
      })),
      reviewer: "objective-pipeline",
      timestamp: new Date().toISOString(),
    };
    this.storage.writeFeedback(id, feedback);
    this.storage.updateStatus(id, {
      stage: "revision_requested",
      rejecting_stage: "objective",
      entered_stage_at: new Date().toISOString(),
    });
    this.emitSSE("deliverable:stage_changed", { id, to_stage: "revision_requested" });
    return false;
  }
  return true;
}
```

- [ ] **Step 3: Add test for module-based objective check**

Add to `server/src/__tests__/engine.test.ts`:

```typescript
describe("module-based objective checks", () => {
  it("runs check modules loaded from .aros/modules", async () => {
    // Set up a simple check module in .aros/modules
    const checksDir = path.join(tmpDir, ".aros", "modules", "checks", "test-check");
    fs.mkdirSync(checksDir, { recursive: true });
    fs.writeFileSync(path.join(checksDir, "manifest.json"), JSON.stringify({
      name: "test-check", type: "check", version: "1.0.0",
      description: "Test", supportedTypes: ["text/*"],
      configSchema: {}, dependencies: { binaries: [], env: [], npm: [] },
      entrypoint: "check.ts",
    }));
    fs.writeFileSync(path.join(checksDir, "check.js"),
      'export default { execute: async (ctx) => ctx.files.map(f => ({ name: "test-check", file: f.filename, passed: f.content.length > 0, details: "checked" })) };'
    );

    // Create policy that uses the module
    storage.writePolicy({
      name: "modular",
      stages: ["objective"],
      max_revisions: 1,
      objective: {
        checks: [{ name: "test-check", config: {}, severity: "blocking" }],
        fail_threshold: 1,
      },
    });

    // Submit deliverable
    const id = storage.createReview({ title: "T", brief: "B", policy: "modular", source_agent: "a", content_type: "text/plain" });
    storage.addFile(id, "test.txt", "hello", "text/plain", "utf-8");

    await engine.initModules();

    // Run the pipeline — this should use the test-check module
    await engine.submit(id);

    // Verify objective results were written using the module
    const results = storage.readObjectiveResults(id);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("test-check");
    expect(results[0].passed).toBe(true);
    expect(results[0].file).toBe("test.txt");
  });
});
```

- [ ] **Step 4: Update subjective stage to use criteria library**

In the `runSubjective` method (or equivalent), replace the existing prompt builder with the module-aware version:

```typescript
private async runSubjectiveWithModules(id: string, policy: PolicyConfig): Promise<boolean> {
  const files = this.storage.listFiles(id);
  const meta = await this.storage.readMeta(id);
  const modulesDir = path.join(this.storage.projectDir, ".aros", "modules");

  const fileEntries: FileEntry[] = files.map((f) => {
    const ct = f.content_type || detectContentType(f.filename);
    const data = this.storage.readFile(id, f.filename);
    return { filename: f.filename, content: data.content, contentType: ct, sizeBytes: f.size_bytes };
  });

  const policyCriteria = policy.subjective?.criteria ?? [];
  const passThreshold = policy.subjective?.pass_threshold ?? 7.0;

  const prompt = buildSubjectivePrompt(fileEntries, meta.brief, policyCriteria, this.criteriaLibrary);

  // Call Claude API
  const response = await this.anthropic.messages.create({
    model: policy.subjective?.evaluation_model ?? "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: prompt.system,
    messages: prompt.messages,
  });

  const responseText = response.content[0].type === "text" ? response.content[0].text : "";
  const scores = parseSubjectiveResponse(responseText, policyCriteria);
  const weightedScore = computeWeightedScore(scores);

  this.storage.writeSubjectiveResults(id, scores);
  this.storage.updateStatus(id, { score: weightedScore });

  if (weightedScore < passThreshold) {
    const feedback: Feedback = {
      stage: "subjective",
      decision: "revision_requested",
      summary: `Score ${weightedScore}/10 is below threshold ${passThreshold}.`,
      issues: scores.filter((s) => (s.score / s.scale) * 10 < passThreshold).map((s) => ({
        file: null, location: "", category: s.name,
        severity: "major" as const,
        description: `${s.name}: ${s.score}/${s.scale} — ${s.rationale}`,
        suggestion: "",
      })),
      reviewer: "subjective-pipeline",
      timestamp: new Date().toISOString(),
    };
    this.storage.writeFeedback(id, feedback);
    this.storage.updateStatus(id, {
      stage: "revision_requested",
      rejecting_stage: "subjective",
      entered_stage_at: new Date().toISOString(),
    });
    this.emitSSE("deliverable:stage_changed", { id, to_stage: "revision_requested" });
    return false;
  }
  return true;
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @aros/server test
```

Expected: All existing tests pass + new module integration test passes.

- [ ] **Step 6: Commit**

```bash
git add server/src/pipeline/engine.ts server/src/__tests__/engine.test.ts
git commit -m "feat(server): integrate module system into pipeline engine"
```

---

### Task 16: Refactor Existing Checks into Built-in Modules

Extract the 5 existing hardcoded checks into module format so they can be shipped in the official modules repo.

**Files:**
- Create: `server/src/modules/builtin-checks/file-size/manifest.json`
- Create: `server/src/modules/builtin-checks/file-size/check.ts`
- Create: `server/src/modules/builtin-checks/format-check/manifest.json`
- Create: `server/src/modules/builtin-checks/format-check/check.ts`
- Create: `server/src/modules/builtin-checks/word-count/manifest.json`
- Create: `server/src/modules/builtin-checks/word-count/check.ts`
- Create: `server/src/modules/builtin-checks/image-dimensions/manifest.json`
- Create: `server/src/modules/builtin-checks/image-dimensions/check.ts`
- Create: `server/src/modules/builtin-checks/profanity/manifest.json`
- Create: `server/src/modules/builtin-checks/profanity/check.ts`
- Create: `server/src/__tests__/builtin-checks.test.ts`

- [ ] **Step 1: Create word-count module as example**

Create `server/src/modules/builtin-checks/word-count/manifest.json`:

```json
{
  "name": "word-count",
  "type": "check",
  "version": "1.0.0",
  "description": "Validates word count is within min/max bounds",
  "supportedTypes": ["text/*"],
  "configSchema": {
    "min": { "type": "number", "default": 0 },
    "max": { "type": "number", "default": 999999 }
  },
  "dependencies": { "binaries": [], "env": [], "npm": [] },
  "entrypoint": "check.ts"
}
```

Create `server/src/modules/builtin-checks/word-count/check.ts`:

```typescript
import type { CheckContext, CheckResult } from "@aros/types";

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    for (const file of ctx.files) {
      if (typeof file.content !== "string") continue;
      const count = file.content.split(/\s+/).filter(Boolean).length;
      const min = (ctx.config.min as number) ?? 0;
      const max = (ctx.config.max as number) ?? Infinity;
      results.push({
        name: "word-count",
        file: file.filename,
        passed: count >= min && count <= max,
        details: `${count} words (required: ${min}–${max})`,
      });
    }
    return results;
  },
};
```

- [ ] **Step 2: Create file-size module**

Create `server/src/modules/builtin-checks/file-size/manifest.json`:

```json
{
  "name": "file-size",
  "type": "check",
  "version": "1.0.0",
  "description": "Validates file size is within maximum limit",
  "supportedTypes": ["*/*"],
  "configSchema": {
    "max_mb": { "type": "number", "default": 10 }
  },
  "dependencies": { "binaries": [], "env": [], "npm": [] },
  "entrypoint": "check.ts"
}
```

Create `server/src/modules/builtin-checks/file-size/check.ts`:

```typescript
import type { CheckContext, CheckResult } from "@aros/types";

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const maxMb = (ctx.config.max_mb as number) ?? 10;
    const maxBytes = maxMb * 1024 * 1024;
    return ctx.files.map((file) => ({
      name: "file-size",
      file: file.filename,
      passed: file.sizeBytes <= maxBytes,
      details: file.sizeBytes <= maxBytes
        ? `${file.sizeBytes} bytes is within ${maxMb} MB limit.`
        : `${file.sizeBytes} bytes exceeds ${maxMb} MB limit (${maxBytes} bytes).`,
    }));
  },
};
```

- [ ] **Step 3: Create format-check module**

Create `server/src/modules/builtin-checks/format-check/manifest.json`:

```json
{
  "name": "format-check",
  "type": "check",
  "version": "1.0.0",
  "description": "Validates content type matches allowed list",
  "supportedTypes": ["*/*"],
  "configSchema": {
    "allowed": { "type": "array", "items": { "type": "string" }, "default": [] }
  },
  "dependencies": { "binaries": [], "env": [], "npm": [] },
  "entrypoint": "check.ts"
}
```

Create `server/src/modules/builtin-checks/format-check/check.ts`:

```typescript
import type { CheckContext, CheckResult } from "@aros/types";

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const allowed = (ctx.config.allowed as string[]) ?? [];
    return ctx.files.map((file) => {
      const passed = allowed.some((pattern) => {
        if (pattern.endsWith("/*")) {
          return file.contentType.startsWith(pattern.slice(0, -1));
        }
        return file.contentType === pattern;
      });
      return {
        name: "format-check",
        file: file.filename,
        passed,
        details: passed
          ? `Content type "${file.contentType}" is allowed.`
          : `Content type "${file.contentType}" is not in allowed list: ${allowed.join(", ")}.`,
      };
    });
  },
};
```

- [ ] **Step 4: Create image-dimensions module**

Create `server/src/modules/builtin-checks/image-dimensions/manifest.json`:

```json
{
  "name": "image-dimensions",
  "type": "check",
  "version": "1.0.0",
  "description": "Validates SVG dimensions via viewBox parsing",
  "supportedTypes": ["image/svg+xml"],
  "configSchema": {
    "min_width": { "type": "number" },
    "max_width": { "type": "number" },
    "min_height": { "type": "number" },
    "max_height": { "type": "number" }
  },
  "dependencies": { "binaries": [], "env": [], "npm": [] },
  "entrypoint": "check.ts"
}
```

Create `server/src/modules/builtin-checks/image-dimensions/check.ts`:

```typescript
import type { CheckContext, CheckResult } from "@aros/types";

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    for (const file of ctx.files) {
      if (typeof file.content !== "string") continue;
      const match = file.content.match(/viewBox=["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/);
      if (!match) {
        results.push({ name: "image-dimensions", file: file.filename, passed: true, details: "Skipped — no viewBox found." });
        continue;
      }
      const width = parseFloat(match[1]);
      const height = parseFloat(match[2]);
      const violations: string[] = [];
      const minW = ctx.config.min_width as number | undefined;
      const maxW = ctx.config.max_width as number | undefined;
      const minH = ctx.config.min_height as number | undefined;
      const maxH = ctx.config.max_height as number | undefined;
      if (minW !== undefined && width < minW) violations.push(`width ${width} < min ${minW}`);
      if (maxW !== undefined && width > maxW) violations.push(`width ${width} > max ${maxW}`);
      if (minH !== undefined && height < minH) violations.push(`height ${height} < min ${minH}`);
      if (maxH !== undefined && height > maxH) violations.push(`height ${height} > max ${maxH}`);
      results.push({
        name: "image-dimensions",
        file: file.filename,
        passed: violations.length === 0,
        details: violations.length === 0 ? `SVG ${width}x${height} within bounds.` : violations.join("; "),
      });
    }
    return results;
  },
};
```

- [ ] **Step 5: Create profanity module**

Create `server/src/modules/builtin-checks/profanity/manifest.json`:

```json
{
  "name": "profanity",
  "type": "check",
  "version": "1.0.0",
  "description": "Scans text for prohibited words",
  "supportedTypes": ["text/*"],
  "configSchema": {
    "words": { "type": "array", "items": { "type": "string" }, "default": [] }
  },
  "dependencies": { "binaries": [], "env": [], "npm": [] },
  "entrypoint": "check.ts"
}
```

Create `server/src/modules/builtin-checks/profanity/check.ts`:

```typescript
import type { CheckContext, CheckResult } from "@aros/types";

const DEFAULT_WORDS = [
  "damn", "hell", "ass", "crap", "bastard", "bitch", "shit", "fuck",
  "piss", "dick", "cock", "pussy", "whore", "slut", "cunt", "nigger", "faggot",
];

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const wordList = (ctx.config.words as string[])?.length ? (ctx.config.words as string[]) : DEFAULT_WORDS;
    return ctx.files.map((file) => {
      if (typeof file.content !== "string") {
        return { name: "profanity", file: file.filename, passed: true, details: "Skipped — binary content." };
      }
      const lower = file.content.toLowerCase();
      const found = wordList.filter((w) => lower.includes(w.toLowerCase()));
      return {
        name: "profanity",
        file: file.filename,
        passed: found.length === 0,
        details: found.length === 0 ? "No prohibited words detected." : `Found: ${found.join(", ")}`,
      };
    });
  },
};
```

- [ ] **Step 6: Write tests for all built-in modules**

Create `server/src/__tests__/builtin-checks.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("built-in check modules", () => {
  it("word-count passes for valid content", async () => {
    const mod = (await import("../modules/builtin-checks/word-count/check.js")).default;
    const results = await mod.execute({
      files: [{ filename: "test.md", content: "hello world foo bar baz", contentType: "text/markdown", sizeBytes: 23 }],
      config: { min: 3, max: 10 }, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(true);
    expect(results[0].details).toContain("5 words");
  });

  it("word-count fails when below minimum", async () => {
    const mod = (await import("../modules/builtin-checks/word-count/check.js")).default;
    const results = await mod.execute({
      files: [{ filename: "test.md", content: "hello", contentType: "text/markdown", sizeBytes: 5 }],
      config: { min: 10, max: 100 }, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(false);
  });

  it("file-size passes for small files", async () => {
    const mod = (await import("../modules/builtin-checks/file-size/check.js")).default;
    const results = await mod.execute({
      files: [{ filename: "test.txt", content: "hello", contentType: "text/plain", sizeBytes: 5 }],
      config: { max_mb: 1 }, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(true);
  });

  it("file-size fails for oversized files", async () => {
    const mod = (await import("../modules/builtin-checks/file-size/check.js")).default;
    const results = await mod.execute({
      files: [{ filename: "big.bin", content: "", contentType: "application/octet-stream", sizeBytes: 20 * 1024 * 1024 }],
      config: { max_mb: 10 }, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(false);
  });

  it("format-check validates content types", async () => {
    const mod = (await import("../modules/builtin-checks/format-check/check.js")).default;
    const results = await mod.execute({
      files: [{ filename: "doc.md", content: "text", contentType: "text/markdown", sizeBytes: 4 }],
      config: { allowed: ["text/*", "image/png"] }, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(true);
  });

  it("image-dimensions checks SVG viewBox", async () => {
    const mod = (await import("../modules/builtin-checks/image-dimensions/check.js")).default;
    const svg = '<svg viewBox="0 0 800 600"></svg>';
    const results = await mod.execute({
      files: [{ filename: "logo.svg", content: svg, contentType: "image/svg+xml", sizeBytes: svg.length }],
      config: { max_width: 1000, max_height: 800 }, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(true);
    expect(results[0].details).toContain("800x600");
  });

  it("profanity detects prohibited words", async () => {
    const mod = (await import("../modules/builtin-checks/profanity/check.js")).default;
    const results = await mod.execute({
      files: [{ filename: "post.md", content: "this is damn good", contentType: "text/markdown", sizeBytes: 17 }],
      config: {}, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("damn");
  });

  it("profanity passes clean content", async () => {
    const mod = (await import("../modules/builtin-checks/profanity/check.js")).default;
    const results = await mod.execute({
      files: [{ filename: "post.md", content: "this is great content", contentType: "text/markdown", sizeBytes: 21 }],
      config: {}, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(true);
  });
});
```

- [ ] **Step 7: Run tests**

```bash
pnpm --filter @aros/server test -- src/__tests__/builtin-checks.test.ts
```

Expected: All 7 tests pass.

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/builtin-checks/ server/src/__tests__/builtin-checks.test.ts
git commit -m "feat(server): extract 5 existing checks into built-in module format"
```
