# Modular Review System — Design Spec

**Date:** 2026-03-12
**Status:** Draft
**Parent:** [AROS Core PRD](../../prds/aros-prd.md)

---

## 1. Problem

AROS has a single monolithic objective check function with 5 hardcoded checks and no subjective review implementation. Different asset types (blog posts, ad creatives, pitch decks, code, legal docs) need different checks and evaluation criteria. Operators need to add, share, and version-control review modules across projects and teams.

## 2. Solution

A module system where objective checks, subjective criteria, and complete policies are distributable units pulled from GitHub repos and pinned via lockfile. Three module types share a common manifest format. The pipeline engine loads modules at runtime and executes them based on policy configuration.

## 3. Module Types

### 3.1 Checks

Code modules that run objective validation. Each check implements a standard interface, declares supported content types, and optionally depends on external tools or APIs.

Examples: word-count (built-in), grammar (API), vale (external binary), eslint (external binary), readability (built-in), required-sections (built-in), seo-meta (built-in), image-dimensions (built-in), brand-lexicon (built-in), link-validation (API), schema-validation (built-in), accessibility (built-in), profanity (built-in), code-lint (external binary).

### 3.2 Criteria

Data-only definitions that instruct Claude how to evaluate a subjective dimension. No code — just a manifest with a description, prompt guidance, applicable content types, default weight, and scale.

Examples: tone-alignment, coherence, originality, audience-fit, visual-quality, brand-alignment, persuasiveness, technical-accuracy, cta-effectiveness, narrative-structure.

### 3.3 Policies

Complete review configurations that reference checks and criteria by name. A policy declares its stage ordering, objective checks with per-check config and severity, subjective criteria with weights and pass threshold, human review requirements, and max revisions. Policies declare their check and criteria dependencies in a `requires` field.

Examples: blog-post, ad-creative, pitch-deck, email-campaign, press-release, case-study, job-description, api-documentation, sales-outreach, investor-update.

## 4. Source Repo Structure

Each source repo (GitHub) follows a standard directory layout:

```
aros-modules/
├── checks/
│   ├── word-count/
│   │   ├── manifest.json
│   │   └── check.ts
│   ├── vale/
│   │   ├── manifest.json
│   │   ├── check.ts
│   │   └── install.sh
│   └── eslint/
│       ├── manifest.json
│       ├── check.ts
│       └── install.sh
├── criteria/
│   ├── tone-alignment/
│   │   └── manifest.json
│   ├── coherence/
│   │   └── manifest.json
│   └── visual-quality/
│       └── manifest.json
└── policies/
    ├── blog-post/
    │   └── policy.json
    ├── ad-creative/
    │   └── policy.json
    └── pitch-deck/
        └── policy.json
```

Each module is a directory containing a `manifest.json` and optionally an entrypoint file (`check.ts`) and install scripts.

## 5. Local Project Structure

After modules are installed, the AROS project directory gains:

```
{project_root}/
├── .aros/
│   ├── registry.json         # configured source repos
│   ├── lock.json             # pinned modules → {repo, path, sha}
│   └── modules/              # fetched module files (gitignored)
│       ├── checks/
│       ├── criteria/
│       └── policies/
├── policies/                  # operator's active policies (editable, overrides modules)
│   ├── default.json
│   └── blog-post.json
└── ...existing AROS dirs...
```

`.aros/modules/` is gitignored (regenerated from lockfile). `.aros/lock.json` and `.aros/registry.json` are committed to the project repo.

## 6. Manifests

### 6.1 Check Manifest

```json
{
  "name": "vale",
  "type": "check",
  "version": "1.0.0",
  "description": "Prose linting via Vale CLI",
  "supportedTypes": ["text/markdown", "text/plain", "text/html"],
  "configSchema": {
    "styles": { "type": "array", "items": { "type": "string" }, "default": ["Microsoft"] },
    "min_alert_level": { "type": "string", "enum": ["suggestion", "warning", "error"], "default": "warning" }
  },
  "dependencies": {
    "binaries": [
      {
        "name": "vale",
        "versionCheck": "vale --version",
        "minVersion": "3.0.0",
        "install": {
          "macos": "brew install vale",
          "linux": "snap install vale",
          "script": "install.sh"
        }
      }
    ],
    "env": [],
    "npm": []
  },
  "entrypoint": "check.ts"
}
```

### 6.2 Check Manifest with API Dependency

```json
{
  "name": "grammar-api",
  "type": "check",
  "version": "1.0.0",
  "description": "Grammar checking via LanguageTool API",
  "supportedTypes": ["text/*"],
  "configSchema": {
    "language": { "type": "string", "default": "en-US" },
    "endpoint": { "type": "string", "default": "https://api.languagetool.org/v2/check" }
  },
  "dependencies": {
    "binaries": [],
    "env": [
      { "name": "AROS_LANGUAGETOOL_API_KEY", "required": false, "description": "API key (optional for public endpoint)" }
    ],
    "npm": []
  },
  "entrypoint": "check.ts"
}
```

### 6.3 Criterion Manifest

Criteria are data-only — no entrypoint, no dependencies. The manifest contains only the evaluation definition:

```json
{
  "name": "tone-alignment",
  "type": "criterion",
  "version": "1.0.0",
  "description": "Does the content match the target tone specified in the brief?",
  "applicableTo": ["text/*"],
  "defaultWeight": 2,
  "scale": 10,
  "promptGuidance": "Compare the brief's stated tone (formal, casual, technical, empathetic) against the actual content. Score 10 = perfect match, 1 = completely wrong register. Evaluate formality level, emotional register, and voice consistency throughout."
}
```

### 6.4 Policy Manifest

```json
{
  "name": "blog-post",
  "type": "policy",
  "version": "1.0.0",
  "description": "Review policy for SEO blog posts",
  "requires": {
    "checks": ["word-count", "grammar", "readability", "required-sections", "seo-meta"],
    "criteria": ["tone-alignment", "coherence", "originality", "audience-fit"]
  },
  "policy": {
    "name": "blog-post",
    "stages": ["objective", "subjective", "human"],
    "max_revisions": 3,
    "objective": {
      "checks": [
        { "name": "word-count", "config": { "min": 800, "max": 2500 }, "severity": "blocking" },
        { "name": "grammar", "config": { "language": "en-US" }, "severity": "warning" },
        { "name": "readability", "config": { "min_grade": 8, "max_grade": 14 }, "severity": "warning" },
        { "name": "required-sections", "config": { "sections": ["Introduction", "Conclusion"] }, "severity": "blocking" },
        { "name": "seo-meta", "config": { "require_title": true, "max_title_length": 60 }, "severity": "warning" }
      ],
      "fail_threshold": 1
    },
    "subjective": {
      "criteria": [
        { "name": "tone-alignment", "weight": 3, "scale": 10 },
        { "name": "coherence", "weight": 3, "scale": 10 },
        { "name": "originality", "weight": 2, "scale": 10 },
        { "name": "audience-fit", "weight": 2, "scale": 10 }
      ],
      "pass_threshold": 7.0
    },
    "human": { "required": true }
  }
}
```

The `requires` field enables transitive dependency resolution: `aros module add blog-post` fetches the policy and all checks + criteria it references.

**Note on duplicate `name` fields:** The outer manifest `name` (line 2) and inner `policy.name` (line 12) must match. Manifest validation (Section 14.0) rejects policy manifests where these diverge. The outer `name` is the module identity used by the lockfile and CLI. The inner `policy.name` is what gets written to `policies/` and referenced by deliverables. They are the same value.

**Note on `PolicySubjectiveCriterion.description`:** The existing `PolicySubjectiveCriterion` type requires a `description` field. In module-based policies, `description` is omitted from the policy JSON because it comes from the criterion module's manifest. The `PolicySubjectiveCriterion` type is updated to make `description` optional:

```typescript
// Updated in packages/types/src/index.ts
export interface PolicySubjectiveCriterion {
  name: string;
  description?: string;  // optional when using module criteria (loaded from criterion manifest)
  weight: number;
  scale: number;
}
```

When the pipeline engine builds the subjective prompt, it resolves `description` by checking the policy field first, then falling back to the criteria library. This allows operator policies to override a criterion's description for a specific use case.

## 7. Check Module Interface

### 7.1 Runtime Interface

```typescript
export interface CheckModule {
  execute(ctx: CheckContext): Promise<CheckResult[]>;
}

export interface CheckContext {
  files: FileEntry[];
  config: Record<string, unknown>;
  brief: string;
  projectDir: string;
}

export interface FileEntry {
  filename: string;
  content: string | Buffer;
  contentType: string;
  sizeBytes: number;
}

// What check modules return
export interface CheckResult {
  name: string;
  file: string | null;
  passed: boolean;
  details: string;
  suggestions?: string[];
}
```

### 7.1.1 Extended ObjectiveCheck Type

The existing `ObjectiveCheck` type in `@aros/types` is extended to include the new fields. This is the type stored in `objective_results.json` and consumed by the dashboard:

```typescript
// Updated ObjectiveCheck in packages/types/src/index.ts
export interface ObjectiveCheck {
  name: string;
  passed: boolean;
  severity: "blocking" | "warning";
  details: string;
  file: string | null;          // NEW: which file this result applies to (null = whole deliverable)
  suggestions?: string[];       // NEW: actionable suggestions from the check module
}
```

**Mapping from CheckResult to ObjectiveCheck:** The pipeline engine merges check module output with policy-level severity. For each `CheckResult` returned by a module, the engine produces an `ObjectiveCheck` by copying all fields and adding `severity` from the policy's per-check config:

```typescript
// In pipeline engine's runObjective():
const checkResults = await mod.execute(ctx);
const objectiveResults = checkResults.map(r => ({
  ...r,
  severity: policyCheck.severity,  // from policy.objective.checks[].severity
}));
```

This keeps severity as a policy concern (the same check module can be "blocking" in one policy and "warning" in another) while preserving the extended fields for the dashboard.

### 7.2 Built-in Check Example (word-count)

```typescript
export default {
  async execute(ctx) {
    const results = [];
    for (const file of ctx.files) {
      if (typeof file.content !== "string") continue;
      const count = file.content.split(/\s+/).filter(Boolean).length;
      const min = ctx.config.min as number ?? 0;
      const max = ctx.config.max as number ?? Infinity;
      results.push({
        name: "word-count",
        file: file.filename,
        passed: count >= min && count <= max,
        details: `${count} words (required: ${min}–${max})`,
      });
    }
    return results;
  }
};
```

### 7.3 External Tool Check Example (vale)

```typescript
import { execFile } from "node:child_process";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export default {
  async execute(ctx) {
    const results = [];
    const tmp = await mkdtemp(join(tmpdir(), "aros-vale-"));

    try {
      for (const file of ctx.files) {
        if (typeof file.content !== "string") continue;
        const filePath = join(tmp, file.filename);
        await writeFile(filePath, file.content);

        const output = await new Promise<string>((resolve, reject) => {
          execFile("vale", [
            "--output", "JSON",
            "--minAlertLevel", ctx.config.min_alert_level as string ?? "warning",
            filePath
          ], (err, stdout) => {
            if (err && !stdout) reject(err);
            else resolve(stdout);
          });
        });

        const alerts = JSON.parse(output)[filePath] ?? [];
        const errors = alerts.filter((a: any) => a.Severity === "error");

        results.push({
          name: "vale",
          file: file.filename,
          passed: errors.length === 0,
          details: errors.length === 0
            ? `${alerts.length} suggestions/warnings (no errors)`
            : `${errors.length} errors: ${errors.map((e: any) => e.Message).join("; ")}`,
          suggestions: alerts.map((a: any) => `[${a.Severity}] ${a.Message} (line ${a.Line})`),
        });
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }

    return results;
  }
};
```

### 7.4 Module Loader

### 7.4.1 TypeScript Execution Strategy

Check modules are authored as `.ts` files in source repos. They are **compiled to JavaScript during `aros module sync`** (and during `aros module add`). The compilation step uses `esbuild` (already a project dependency) to bundle each `check.ts` into a self-contained `check.js` file in the local `.aros/modules/` directory.

```typescript
// cli/src/compile.ts
import { buildSync } from "esbuild";

export function compileCheckModule(modulePath: string): void {
  const entrypoint = join(modulePath, "check.ts");
  if (!existsSync(entrypoint)) return; // criteria modules have no code
  buildSync({
    entryPoints: [entrypoint],
    outfile: join(modulePath, "check.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    external: ["node:*"],  // don't bundle Node.js built-ins
  });
}
```

This runs during `aros module add` and `aros module sync`. The compiled `.js` files live alongside the `.ts` source in `.aros/modules/` (both are gitignored). The runtime loader imports only the compiled `.js`:

```typescript
export async function loadCheck(moduleName: string, modulesDir: string): Promise<CheckModule> {
  const entrypoint = join(modulesDir, "checks", moduleName, "check.js");
  const mod = await import(pathToFileURL(entrypoint).href);
  return mod.default;
}

export async function loadAllChecks(modulesDir: string): Promise<Map<string, CheckModule>> {
  const checks = new Map();
  const checksDir = join(modulesDir, "checks");
  if (!existsSync(checksDir)) return checks;
  for (const entry of readdirSync(checksDir)) {
    checks.set(entry, await loadCheck(entry, modulesDir));
  }
  return checks;
}
```

This approach means: no runtime TypeScript loader required, no `tsx`/`ts-node` dependency, consistent with the project's existing esbuild toolchain, and compilation errors surface at install time rather than runtime.

## 8. Subjective Review System

### 8.1 Criteria Loader

Reads installed criteria manifests into a lookup map.

```typescript
export interface CriterionDef {
  name: string;
  description: string;
  applicableTo: string[];
  defaultWeight: number;
  scale: number;
  promptGuidance: string;
}

export function loadCriteriaLibrary(modulesDir: string): Map<string, CriterionDef> {
  const library = new Map();
  const criteriaDir = join(modulesDir, "criteria");
  if (!existsSync(criteriaDir)) return library;
  for (const entry of readdirSync(criteriaDir)) {
    const manifest = JSON.parse(readFileSync(join(criteriaDir, entry, "manifest.json"), "utf-8"));
    library.set(manifest.name, manifest);
  }
  return library;
}
```

### 8.2 Prompt Builder

Assembles criteria into the Claude call, adapting content by type.

```typescript
export function buildPrompt(
  files: FileEntry[],
  brief: string,
  policyCriteria: PolicySubjectiveCriterion[],
  library: Map<string, CriterionDef>
): AnthropicMessage[] {
  const contentBlocks: ContentBlock[] = [];
  for (const file of files) {
    if (file.contentType.startsWith("image/")) {
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: file.contentType, data: file.content as string }
      });
    } else {
      contentBlocks.push({
        type: "text",
        text: `<file name="${file.filename}">\n${file.content}\n</file>`
      });
    }
  }

  const criteriaBlock = policyCriteria.map((pc, i) => {
    const def = library.get(pc.name);
    return `### ${i + 1}. ${pc.name} (weight: ${pc.weight}, scale: ${pc.scale})
${def?.description ?? "Evaluate this criterion."}
${def?.promptGuidance ?? ""}`;
  }).join("\n\n");

  return [{
    role: "user",
    content: [
      ...contentBlocks,
      {
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
}`
      }
    ]
  }];
}
```

### 8.3 Content Type Filtering

Criteria with `applicableTo: ["image/*"]` are excluded when reviewing text files, and vice versa. The prompt builder checks each criterion's `applicableTo` against the files being reviewed using the same MIME glob matching as objective checks (Section 9.3). Only criteria with at least one matching file are included in the prompt.

For folder deliverables with mixed content (images + text), the subjective stage runs separate Claude calls: one with image files + image-applicable criteria, one with text files + text-applicable criteria.

**Score combination for mixed-content folders:** Scores from separate calls are concatenated into a single `SubjectiveCriterion[]` array. The weighted score is computed across all criteria regardless of which call produced them. A criterion with `applicableTo: ["*/*"]` runs in the text call only (to avoid duplicate scoring). If a criterion matches both text and image types specifically (e.g., `applicableTo: ["text/*", "image/*"]`), it runs in the first applicable call.

### 8.4 Response Parser and Score Computation

```typescript
/**
 * Extract JSON from Claude's response. Handles two formats:
 * 1. Plain JSON: response is a raw JSON object
 * 2. Markdown code block: response contains ```json ... ```
 * Tries JSON.parse first, then extracts from code fences.
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
  response: AnthropicResponse,
  policyCriteria: PolicySubjectiveCriterion[]
): SubjectiveCriterion[] {
  const text = response.content[0].text;
  const json = extractJSON(text);
  return json.scores.map((s: any) => {
    const pc = policyCriteria.find(c => c.name === s.name);
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
 * Compute a normalized weighted score on a 0-10 scale.
 * Each criterion's score is normalized by its scale (score/scale * 10)
 * before weighting. This means a score of 4/5 and 8/10 both contribute
 * equally (both are 8.0 normalized). The pass_threshold in policies
 * is always on this 0-10 normalized scale.
 */
export function computeWeightedScore(scores: SubjectiveCriterion[]): number {
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = scores.reduce((sum, s) => sum + (s.score / s.scale) * 10 * s.weight, 0);
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}
```

## 9. Pipeline Engine Integration

### 9.1 Engine Initialization

**Note:** `Storage.projectDir` is currently `private` in the existing codebase. It must be changed to `public readonly` (it is already set in the constructor and never reassigned) so the pipeline engine and module system can access it for path resolution.

```typescript
export class PipelineEngine {
  private checkModules: Map<string, CheckModule>;
  private criteriaLibrary: Map<string, CriterionDef>;
  private storage: Storage;

  async init(storage: Storage) {
    this.storage = storage;
    const modulesDir = join(storage.projectDir, ".aros", "modules");
    this.checkModules = await loadAllChecks(modulesDir);
    this.criteriaLibrary = loadCriteriaLibrary(modulesDir);
  }
}
```

### 9.2 Pipeline Execution

```typescript
async runPipeline(id: string): Promise<void> {
  const meta = this.storage.readMeta(id);
  const policy = this.resolvePolicy(meta.policy);

  for (const stage of policy.stages) {
    this.storage.updateStatus(id, {
      stage,
      entered_stage_at: new Date().toISOString()
    });
    this.emitSSE("deliverable:stage_changed", { id, to_stage: stage });

    if (stage === "objective") {
      const passed = await this.runObjective(id, policy);
      if (!passed) return;
    } else if (stage === "subjective") {
      const passed = await this.runSubjective(id, policy);
      if (!passed) return;
    } else if (stage === "human") {
      return; // pipeline pauses for human decision
    }
  }
}
```

### 9.3 Objective Stage

Iterates policy checks through the module registry. For each check:

1. Load the check module by name from the registry.
2. Read the module's manifest to get `supportedTypes`.
3. Filter the deliverable's files against `supportedTypes` using MIME glob matching: `text/*` matches `text/markdown`, `text/plain`, etc. `image/*` matches `image/png`, `image/jpeg`, etc. `*/*` matches everything. Exact types like `text/markdown` match only that type.
4. If no files match, the check is **skipped entirely** — no result is produced. This means a `word-count` check configured for `text/*` produces no output when reviewing an image-only deliverable.
5. Run the check with matching files and the policy's per-check config.
6. Map each `CheckResult` to an `ObjectiveCheck` by adding `severity` from the policy config (see Section 7.1.1).

**`fail_threshold` semantics:** `fail_threshold: N` means the deliverable enters `revision_requested` when `N` or more blocking checks fail. A value of `1` means zero tolerance — any single blocking failure halts the pipeline. A value of `2` allows one blocking failure to pass through. Warning-severity results are recorded but never count toward the threshold.

### 9.4 Subjective Stage

Loads files, builds the prompt from criteria library definitions and policy weights, calls the Claude API, parses the response, computes the weighted score. If below `pass_threshold`, enters `revision_requested`.

### 9.5 Policy Resolution

Operator policies in `policies/` take precedence over module policies in `.aros/modules/policies/`. This allows an operator to `aros module add blog-post`, then copy the policy to `policies/blog-post.json` and customize thresholds without modifying the module.

```typescript
private resolvePolicy(policyName: string): PolicyConfig {
  // 1. Check operator's policies/ dir first (uses try/catch because
  //    Storage.readPolicy() throws on missing files)
  try {
    return this.storage.readPolicy(policyName);
  } catch {
    // Not in operator policies, fall through
  }

  // 2. Fall back to module policies
  const modulePolicyPath = join(this.storage.projectDir, ".aros", "modules",
    "policies", policyName, "policy.json");
  if (existsSync(modulePolicyPath)) {
    return JSON.parse(readFileSync(modulePolicyPath, "utf-8")).policy;
  }

  throw new Error(`Policy not found: ${policyName}`);
}
```

## 10. Registry and Lockfile

### 10.1 Registry Config

`.aros/registry.json` — list of configured source repos:

```json
{
  "sources": [
    {
      "name": "official",
      "url": "https://github.com/aros-project/modules.git",
      "branch": "main"
    },
    {
      "name": "company",
      "url": "https://github.com/acme-corp/aros-modules.git",
      "branch": "main"
    }
  ]
}
```

The official repo is the default source. `aros init` is updated to create `.aros/registry.json` with the official source and an empty `.aros/lock.json` (`{ "version": 1, "locked": {} }`). This happens alongside the existing initialization of `review/`, `approved/`, `rejected/`, `policies/`, and `.aros.json`.

### 10.2 Lockfile

`.aros/lock.json` — pins every installed module to a git SHA:

```json
{
  "version": 1,
  "locked": {
    "checks/vale": {
      "source": "official",
      "path": "checks/vale",
      "sha": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "version": "1.0.0",
      "lockedAt": "2026-03-12T10:00:00Z"
    },
    "criteria/tone-alignment": {
      "source": "official",
      "path": "criteria/tone-alignment",
      "sha": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      "version": "1.0.0",
      "lockedAt": "2026-03-12T10:00:00Z"
    },
    "policies/blog-post": {
      "source": "official",
      "path": "policies/blog-post",
      "sha": "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5",
      "version": "1.0.0",
      "lockedAt": "2026-03-12T10:00:00Z"
    }
  }
}
```

SHAs are immutable. Even if the source branch moves forward, `aros module sync` fetches exactly what's locked.

### 10.3 Git Integration

Committed to the project repo: `.aros/lock.json`, `.aros/registry.json`.

Gitignored: `.aros/modules/` (regenerated from lockfile via `aros module sync`).

Same pattern as `node_modules/` vs `package-lock.json`.

## 11. CLI Commands

### 11.1 Registry Management

| Command | Description |
|---|---|
| `aros registry add <url>` | Add a source repo to `registry.json`. Optional `--name` and `--branch` flags. |
| `aros registry remove <name>` | Remove a source repo. |
| `aros registry list` | Show configured sources with URL and branch. |

### 11.2 Module Management

| Command | Description |
|---|---|
| `aros module add <name>` | Fetch module from sources, resolve dependencies (policy pulls its checks + criteria), write to `.aros/modules/`, update lockfile. Optional `--source` flag to target a specific source. |
| `aros module remove <name>` | Remove module from `.aros/modules/` and lockfile. Warns if other modules depend on it. |
| `aros module list` | Show installed modules with type, version, source, and dependency status. |
| `aros module update` | Check all sources for newer versions, show changes, update lockfile on confirm. Optional `--all --yes` for CI. |
| `aros module update <name>` | Update a single module. |
| `aros module sync` | Fetch all modules from lockfile. Used after clone or in CI. |
| `aros module check` | Validate all external dependencies (binaries, env vars, npm packages). Report missing with install instructions. |
| `aros module install-deps <name>` | Run install scripts for a module's missing dependencies with confirmation prompts. |
| `aros module rollback <name>` | Restore previous SHA from lockfile git history. |

### 11.3 Dependency Resolution Flow

`aros module add blog-post`:

1. Search configured sources **in `registry.json` array order**. First source containing `policies/blog-post` wins. The `--source` flag overrides this and targets a specific source.
2. Read manifest, find `requires: { checks: [...], criteria: [...] }`
3. For each dependency:
   - Already installed from any source? **Skip.** An existing module satisfies the dependency regardless of which source it came from. Source conflicts are not errors — if `checks/grammar` is installed from "company" and the policy requires it from "official," the existing install satisfies the requirement.
   - Not installed? Search sources (same array-order priority) and fetch.
   - Not found in any source? **Error.** Report which modules are missing and from which policy they're required. The policy is still installed but flagged as having unmet module dependencies.
4. Write all new modules to `.aros/modules/`
5. Update `.aros/lock.json`
6. Compile any check modules with TypeScript entrypoints (Section 7.4.1)
7. Run dependency check for external tools/APIs
8. For each missing required dependency, prompt to install
9. Report status

## 12. Dependency Validation and Install

### 12.1 Dependency Check

Each manifest declares dependencies in three categories:

- **binaries** — external executables (vale, eslint). Declares name, version check command, minimum version, and per-platform install commands.
- **env** — environment variables (API keys). Declares name, required flag, and description.
- **npm** — Node.js packages. Declares name and minimum version.

### 12.2 Validation Behavior

**On `aros module add`:** interactive. Prompts to install missing required dependencies. Shows platform-appropriate install command with multiple options.

**On `aros serve` (server startup):** non-interactive. Logs status of all module dependencies. Missing optional dependencies produce warnings. Missing required dependencies produce errors but do not block startup — the check module returns a failure result at runtime, giving the operator a clear signal in review results.

**On `aros module check`:** reports all dependency status without modifying anything.

### 12.3 Install Flow Example

```
$ aros module add vale

✓ Found checks/vale v1.0.0 in "official"
✓ Fetched to .aros/modules/checks/vale (sha: a1b2c3d)
✓ Lockfile updated

Checking dependencies...

  ✓ No env vars required
  ✗ vale binary not found

  vale v3.0.0+ is required.

  Install automatically?

  ● brew install vale  (macOS)
  ○ snap install vale  (Linux)
  ○ Skip — I'll install manually

> Installing via brew...
✓ vale v3.7.1 installed

✓ All dependencies satisfied. Module ready to use.
```

## 13. Update Flow

### 13.1 Update Command

`aros module update` checks all sources for newer commits on the pinned paths. "Newer" means **the HEAD of the source branch has a different SHA than the locked SHA for that module's path**. The version field in the manifest is informational and displayed to the operator, but the SHA is what determines whether an update is available. This means code-only changes without a version bump are still detected as updates.

Shows available updates with version changes and a summary of what changed. Operator confirms per module or uses `--all --yes` for CI.

### 13.2 Policy Updates with New Dependencies

If an updated policy adds a new check or criterion to its `requires` field, the update command flags this. The operator can accept the update and add the new dependency, or skip the update.

### 13.3 Rollback

`aros module rollback <name>` restores a module to its previous version. It works by:

1. Reading the current `.aros/lock.json` and finding the module's entry.
2. Using `git log -p -- .aros/lock.json` to find the most recent commit where that module's SHA was different.
3. Extracting the previous SHA from that commit's version of the lockfile.
4. Re-fetching the module at the old SHA from its source.
5. Updating the lockfile with the restored SHA.

**Constraints:**
- Requires the project to be a git repo with `.aros/lock.json` committed. If not a git repo, rollback is unavailable and the command exits with an error suggesting manual version pinning.
- Rollback goes back exactly one step (the most recent previous SHA). For deeper history, the operator uses `git log -- .aros/lock.json` to find the desired SHA and runs `aros module add <name> --sha <sha>`.
- Rollback also re-compiles the module if it has a TypeScript entrypoint.

## 14. Relationship to Existing Code

### 14.0 Manifest Validation

When `aros module add` fetches a module from a remote source, it validates the manifest before installing:

1. **Schema validation:** Each manifest type (check, criterion, policy) has a Zod schema. Invalid manifests produce an error with the specific validation failure. The module is not installed.
2. **Required fields:** `name`, `type`, and `version` are required on all manifests. Checks require `supportedTypes` and `entrypoint`. Criteria require `applicableTo`, `scale`, and `promptGuidance`. Policies require `requires` and `policy`.
3. **Entrypoint exists:** For check modules, the declared `entrypoint` file must exist in the fetched directory.
4. **Policy name consistency:** For policy modules, the outer manifest `name` must match the inner `policy.name`. Mismatches are rejected.

This prevents malformed community modules from crashing the loader at runtime.

### 14.1 What Changes

- **`server/src/pipeline/objective.ts`** — refactored from a monolithic function into the check registry pattern. The 5 existing checks (file_size, format_check, word_count, image_dimensions, profanity_check) become built-in modules shipped in the official source repo.
- **`server/src/pipeline/engine.ts`** (not yet implemented) — built using the module-aware design from this spec.
- **`packages/types/src/index.ts`** — extended with `CheckModule`, `CheckContext`, `CheckResult`, `CriterionDef` interfaces.

### 14.2 What's New

- `server/src/pipeline/check-loader.ts` — module loader for checks
- `server/src/pipeline/criteria-loader.ts` — criteria library loader
- `server/src/pipeline/subjective/prompt-builder.ts` — prompt assembly
- `server/src/pipeline/subjective/response-parser.ts` — Claude response parsing
- `server/src/pipeline/subjective/engine.ts` — subjective stage orchestration
- `cli/src/registry.ts` — registry management commands
- `cli/src/modules.ts` — module add/remove/update/sync/check commands
- `cli/src/deps.ts` — dependency validation and install

### 14.3 What Doesn't Change

- `server/src/storage.ts` — unchanged. Policies still live in `policies/` on disk. The pipeline engine resolves policies from either `policies/` or `.aros/modules/policies/`.
- `server/src/notifications/` — unchanged. Notification drivers are a separate concern.
- Dashboard — unchanged. It reads review results from the REST API regardless of which modules produced them.
