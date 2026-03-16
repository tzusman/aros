# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On first run, scan the codebase via `claude -p` to recommend registry policies and generate a starter prompt from real repo files.

**Architecture:** Single new file `cli/src/onboard.ts` containing all onboarding logic (repo scanning, LLM invocation, interactive confirmation, policy installation, prompt generation). The existing `cli/src/index.ts` calls `onboard()` between `storage.init()` and `firstRunSetup()`. Each LLM call shells out to `claude -p` via `child_process.spawn()` with stdin piping.

**Tech Stack:** TypeScript, Node.js `child_process.spawn`, `@clack/prompts` (existing dep), `picocolors` (existing dep), `@aros/server` Storage API, vitest

**Spec:** `docs/superpowers/specs/2026-03-16-onboarding-flow-design.md`

---

## Chunk 1: Core Utilities (repo scanner, LLM caller, JSON parser)

### Task 1: Repo Scanner — `scanRepo()`

**Files:**
- Create: `cli/src/onboard.ts`
- Test: `cli/src/__tests__/onboard.test.ts`

- [ ] **Step 1: Write failing test for `scanRepo()` — directory tree**

Create `cli/src/__tests__/onboard.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { scanRepo } from "../onboard.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-onboard-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("scanRepo()", () => {
  it("returns directory tree excluding ignored dirs", () => {
    // Create a project structure
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "blog"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "node_modules", "pkg"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "src", "index.ts"), "export {}");
    fs.writeFileSync(path.join(tmpDir, "blog", "post.md"), "# Hello");

    const result = scanRepo(tmpDir);

    expect(result.tree).toContain("src/");
    expect(result.tree).toContain("blog/");
    expect(result.tree).not.toContain("node_modules");
    expect(result.tree).not.toContain(".git");
  });

  it("reads README excerpt (first 200 lines)", () => {
    const lines = Array.from({ length: 250 }, (_, i) => `Line ${i + 1}`);
    fs.writeFileSync(path.join(tmpDir, "README.md"), lines.join("\n"));

    const result = scanRepo(tmpDir);

    expect(result.readme).toContain("Line 1");
    expect(result.readme).toContain("Line 200");
    expect(result.readme).not.toContain("Line 201");
  });

  it("returns empty readme when no README exists", () => {
    const result = scanRepo(tmpDir);
    expect(result.readme).toBe("");
  });

  it("collects sample files with sizes, preferring shallow files", () => {
    fs.mkdirSync(path.join(tmpDir, "content"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "deep", "nested", "dir"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "content", "post.md"), "# Post\n".repeat(100));
    fs.writeFileSync(path.join(tmpDir, "deep", "nested", "dir", "hidden.md"), "x");

    const result = scanRepo(tmpDir);

    expect(result.sampleFiles.length).toBeGreaterThan(0);
    expect(result.sampleFiles[0]).toMatch(/content\/post\.md/);
    // Each entry should include size
    expect(result.sampleFiles[0]).toMatch(/\(\d+ bytes\)/);
  });

  it("limits sample files to 50", () => {
    fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });
    for (let i = 0; i < 60; i++) {
      fs.writeFileSync(path.join(tmpDir, "docs", `file-${i}.md`), `# File ${i}`);
    }

    const result = scanRepo(tmpDir);
    expect(result.sampleFiles.length).toBeLessThanOrEqual(50);
  });

  it("only collects targeted extensions", () => {
    fs.writeFileSync(path.join(tmpDir, "app.ts"), "code");
    fs.writeFileSync(path.join(tmpDir, "post.md"), "# Post");
    fs.writeFileSync(path.join(tmpDir, "logo.png"), "fake-png");

    const result = scanRepo(tmpDir);

    const filenames = result.sampleFiles.join("\n");
    expect(filenames).toContain("post.md");
    expect(filenames).toContain("logo.png");
    expect(filenames).not.toContain("app.ts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: FAIL — `scanRepo` does not exist yet

- [ ] **Step 3: Implement `scanRepo()`**

Create `cli/src/onboard.ts` with the scanner:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

const IGNORED_DIRS = new Set([
  ".git", "node_modules", "dist", ".aros", "build",
  "coverage", ".next", ".cache", ".worktrees",
]);

const CONTENT_EXTENSIONS = new Set([
  ".md", ".html", ".htm", ".txt", ".mjml",
  ".png", ".jpg", ".jpeg", ".svg", ".pdf",
]);

const MAX_TREE_DEPTH = 3;
const MAX_SAMPLE_FILES = 50;
const MAX_README_LINES = 200;

export interface RepoScan {
  tree: string;
  readme: string;
  sampleFiles: string[];
}

export function scanRepo(projectDir: string): RepoScan {
  const tree = buildTree(projectDir, "", 0);
  const readme = readReadme(projectDir);
  const sampleFiles = collectSampleFiles(projectDir);
  return { tree, readme, sampleFiles };
}

function buildTree(dir: string, prefix: string, depth: number): string {
  if (depth >= MAX_TREE_DEPTH) return "";
  let result = "";
  let entries: string[];
  try {
    entries = fs.readdirSync(dir).sort();
  } catch {
    return "";
  }
  for (const entry of entries) {
    if (entry.startsWith(".") && IGNORED_DIRS.has(entry)) continue;
    if (IGNORED_DIRS.has(entry)) continue;
    const fullPath = path.join(dir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      result += `${prefix}${entry}/\n`;
      result += buildTree(fullPath, prefix + "  ", depth + 1);
    } else {
      result += `${prefix}${entry}\n`;
    }
  }
  return result;
}

function readReadme(projectDir: string): string {
  for (const name of ["README.md", "README", "README.txt", "README.rst"]) {
    const p = path.join(projectDir, name);
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, "utf-8");
        const lines = content.split("\n");
        return lines.slice(0, MAX_README_LINES).join("\n");
      } catch {
        continue;
      }
    }
  }
  return "";
}

function collectSampleFiles(projectDir: string): string[] {
  const files: Array<{ relative: string; depth: number; size: number }> = [];
  walkForSamples(projectDir, projectDir, 0, files);

  // Sort by depth (shallow first), then by name
  files.sort((a, b) => a.depth - b.depth || a.relative.localeCompare(b.relative));

  return files
    .slice(0, MAX_SAMPLE_FILES)
    .map((f) => `${f.relative} (${f.size} bytes)`);
}

function walkForSamples(
  root: string,
  dir: string,
  depth: number,
  out: Array<{ relative: string; depth: number; size: number }>,
): void {
  if (depth > MAX_TREE_DEPTH) return;
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const fullPath = path.join(dir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkForSamples(root, fullPath, depth + 1, out);
    } else {
      const ext = path.extname(entry).toLowerCase();
      if (CONTENT_EXTENSIONS.has(ext)) {
        out.push({
          relative: path.relative(root, fullPath),
          depth,
          size: stat.size,
        });
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/onboard.ts cli/src/__tests__/onboard.test.ts
git commit -m "feat(onboard): add repo scanner with tree, readme, and sample file collection"
```

---

### Task 2: LLM Caller — `callClaude()`

**Files:**
- Modify: `cli/src/onboard.ts`
- Test: `cli/src/__tests__/onboard.test.ts`

- [ ] **Step 1: Write failing test for `callClaude()`**

Append to `cli/src/__tests__/onboard.test.ts`:

```typescript
import { callClaude } from "../onboard.js";

describe("callClaude()", () => {
  it("returns null when claude CLI is not available", async () => {
    // Use a nonexistent command to simulate missing CLI
    const result = await callClaude("test prompt", {
      command: "nonexistent-binary-xyz",
      timeoutMs: 5000,
    });
    expect(result).toBeNull();
  });

  it("returns null on timeout", async () => {
    // Use `sleep` to simulate a slow response, with very short timeout
    const result = await callClaude("test", {
      command: "sleep",
      args: ["10"],
      timeoutMs: 100,
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: FAIL — `callClaude` does not exist

- [ ] **Step 3: Implement `callClaude()`**

Add to `cli/src/onboard.ts`:

```typescript
import { spawn } from "node:child_process";

export interface ClaudeOptions {
  command?: string;
  args?: string[];
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function callClaude(
  prompt: string,
  opts: ClaudeOptions = {},
): Promise<string | null> {
  const command = opts.command ?? "claude";
  const args = opts.args ?? [
    "-p",
    "--output-format", "json",
    "--max-turns", "1",
    "--model", "haiku",
    "--max-budget-usd", "0.05",
  ];
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      resolve(null);
      return;
    }

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);

    child.on("error", () => {
      clearTimeout(timeout);
      resolve(null);
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        resolve(null);
        return;
      }
      resolve(stdout);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: All tests PASS (including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add cli/src/onboard.ts cli/src/__tests__/onboard.test.ts
git commit -m "feat(onboard): add callClaude() helper to spawn claude -p via stdin"
```

---

### Task 3: JSON Parser — `parseJsonResponse()`

**Files:**
- Modify: `cli/src/onboard.ts`
- Test: `cli/src/__tests__/onboard.test.ts`

- [ ] **Step 1: Write failing tests for `parseJsonResponse()`**

Append to `cli/src/__tests__/onboard.test.ts`:

```typescript
import { parseJsonResponse } from "../onboard.js";

describe("parseJsonResponse()", () => {
  it("parses raw JSON directly", () => {
    const result = parseJsonResponse('{"key": "value"}');
    expect(result).toEqual({ key: "value" });
  });

  it("strips markdown fences and parses", () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(parseJsonResponse(input)).toEqual({ key: "value" });
  });

  it("strips fences without language tag", () => {
    const input = '```\n{"key": "value"}\n```';
    expect(parseJsonResponse(input)).toEqual({ key: "value" });
  });

  it("extracts JSON object from surrounding text", () => {
    const input = 'Here is the result:\n{"key": "value"}\nDone.';
    expect(parseJsonResponse(input)).toEqual({ key: "value" });
  });

  it("extracts JSON array from surrounding text", () => {
    const input = 'Result: [1, 2, 3] end';
    expect(parseJsonResponse(input)).toEqual([1, 2, 3]);
  });

  it("returns null for unparseable input", () => {
    expect(parseJsonResponse("not json at all")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseJsonResponse("")).toBeNull();
  });

  it("handles claude --output-format json wrapper", () => {
    // claude -p --output-format json wraps the response in {"result": "..."}
    const claudeOutput = JSON.stringify({
      result: '{"recommendations": [{"policy": "blog-post", "confidence": "high", "reason": "Found blog/ dir"}]}',
    });
    const parsed = parseJsonResponse(claudeOutput);
    // The outer parse succeeds — caller extracts .result and re-parses
    expect(parsed).toHaveProperty("result");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: FAIL — `parseJsonResponse` not exported

- [ ] **Step 3: Implement `parseJsonResponse()`**

Add to `cli/src/onboard.ts`:

```typescript
export function parseJsonResponse(raw: string): unknown {
  if (!raw || !raw.trim()) return null;

  // 1. Try direct parse
  try {
    return JSON.parse(raw);
  } catch { /* continue */ }

  // 2. Strip markdown fences and retry
  const stripped = raw
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "");
  try {
    return JSON.parse(stripped);
  } catch { /* continue */ }

  // 3. Extract first JSON object or array
  const match = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch { /* continue */ }
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/onboard.ts cli/src/__tests__/onboard.test.ts
git commit -m "feat(onboard): add defensive JSON parser with fence stripping"
```

---

## Chunk 2: Registry Reader & Policy Installation

### Task 4: Registry Manifest Reader — `loadRegistryPolicies()`

**Files:**
- Modify: `cli/src/onboard.ts`
- Test: `cli/src/__tests__/onboard.test.ts`

- [ ] **Step 1: Write failing test**

Append to `cli/src/__tests__/onboard.test.ts`:

```typescript
import { loadRegistryPolicies } from "../onboard.js";

describe("loadRegistryPolicies()", () => {
  it("reads all manifest.json files from registry/policies/", () => {
    // Create a mini registry
    const regDir = path.join(tmpDir, "registry", "policies");
    fs.mkdirSync(path.join(regDir, "blog-post"), { recursive: true });
    fs.mkdirSync(path.join(regDir, "email-campaign"), { recursive: true });

    fs.writeFileSync(
      path.join(regDir, "blog-post", "manifest.json"),
      JSON.stringify({
        name: "blog-post",
        description: "SEO blog posts",
        usage_hint: "Use for blog posts",
        policy: { name: "blog-post", stages: ["objective"] },
      }),
    );
    fs.writeFileSync(
      path.join(regDir, "email-campaign", "manifest.json"),
      JSON.stringify({
        name: "email-campaign",
        description: "Marketing emails",
        policy: { name: "email-campaign", stages: ["objective"] },
      }),
    );

    const policies = loadRegistryPolicies(path.join(tmpDir, "registry"));
    expect(policies).toHaveLength(2);
    expect(policies.map((p) => p.name)).toContain("blog-post");
    expect(policies.map((p) => p.name)).toContain("email-campaign");
  });

  it("includes description and usage_hint in output", () => {
    const regDir = path.join(tmpDir, "registry", "policies");
    fs.mkdirSync(path.join(regDir, "blog-post"), { recursive: true });
    fs.writeFileSync(
      path.join(regDir, "blog-post", "manifest.json"),
      JSON.stringify({
        name: "blog-post",
        description: "SEO blog posts",
        usage_hint: "Use for marketing blogs",
        policy: { name: "blog-post", stages: ["objective"] },
      }),
    );

    const policies = loadRegistryPolicies(path.join(tmpDir, "registry"));
    expect(policies[0].description).toBe("SEO blog posts");
    expect(policies[0].usageHint).toBe("Use for marketing blogs");
  });

  it("returns empty array when registry dir does not exist", () => {
    const policies = loadRegistryPolicies("/nonexistent/path");
    expect(policies).toEqual([]);
  });

  it("skips malformed manifests", () => {
    const regDir = path.join(tmpDir, "registry", "policies");
    fs.mkdirSync(path.join(regDir, "good"), { recursive: true });
    fs.mkdirSync(path.join(regDir, "bad"), { recursive: true });

    fs.writeFileSync(
      path.join(regDir, "good", "manifest.json"),
      JSON.stringify({ name: "good", description: "Good", policy: { name: "good", stages: [] } }),
    );
    fs.writeFileSync(path.join(regDir, "bad", "manifest.json"), "not json");

    const policies = loadRegistryPolicies(path.join(tmpDir, "registry"));
    expect(policies).toHaveLength(1);
    expect(policies[0].name).toBe("good");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: FAIL — `loadRegistryPolicies` not exported

- [ ] **Step 3: Implement `loadRegistryPolicies()`**

Add to `cli/src/onboard.ts`:

```typescript
export interface RegistryPolicy {
  name: string;
  description: string;
  usageHint: string;
  policy: Record<string, unknown>; // the raw policy config to install
}

export function loadRegistryPolicies(registryDir: string): RegistryPolicy[] {
  const policiesDir = path.join(registryDir, "policies");
  if (!fs.existsSync(policiesDir)) return [];

  const entries = fs.readdirSync(policiesDir);
  const policies: RegistryPolicy[] = [];

  for (const entry of entries) {
    const manifestPath = path.join(policiesDir, entry, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      policies.push({
        name: raw.name,
        description: raw.description ?? "",
        usageHint: raw.usage_hint ?? "",
        policy: raw.policy,
      });
    } catch {
      // Skip malformed manifests
    }
  }

  return policies;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/onboard.ts cli/src/__tests__/onboard.test.ts
git commit -m "feat(onboard): add registry manifest reader"
```

---

### Task 5: Policy Installer — `installPolicies()`

**Files:**
- Modify: `cli/src/onboard.ts`
- Test: `cli/src/__tests__/onboard.test.ts`

- [ ] **Step 1: Write failing test**

Append to `cli/src/__tests__/onboard.test.ts`:

```typescript
import { installPolicies } from "../onboard.js";
import { Storage } from "@aros/server";

describe("installPolicies()", () => {
  it("writes selected policies to .aros/policies/ via Storage", async () => {
    const storage = new Storage(tmpDir);
    await storage.init();

    const registryPolicies: RegistryPolicy[] = [
      {
        name: "blog-post",
        description: "SEO blog posts",
        usageHint: "Use for blogs",
        policy: { name: "blog-post", stages: ["objective", "subjective", "human"], max_revisions: 3 },
      },
    ];

    await installPolicies(storage, ["blog-post"], registryPolicies);

    const names = await storage.listPolicies();
    expect(names).toContain("blog-post");
    // default should still be there
    expect(names).toContain("default");
  });

  it("skips policies not in the registry", async () => {
    const storage = new Storage(tmpDir);
    await storage.init();

    await installPolicies(storage, ["nonexistent"], []);

    const names = await storage.listPolicies();
    expect(names).not.toContain("nonexistent");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: FAIL — `installPolicies` not exported

- [ ] **Step 3: Implement `installPolicies()`**

Add to `cli/src/onboard.ts`:

```typescript
import { Storage } from "@aros/server";

export async function installPolicies(
  storage: Storage,
  selectedNames: string[],
  registryPolicies: RegistryPolicy[],
): Promise<string[]> {
  const installed: string[] = [];
  const byName = new Map(registryPolicies.map((p) => [p.name, p]));

  for (const name of selectedNames) {
    const reg = byName.get(name);
    if (!reg?.policy) continue;
    await storage.writePolicy(name, reg.policy as any);
    installed.push(name);
  }

  return installed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/onboard.ts cli/src/__tests__/onboard.test.ts
git commit -m "feat(onboard): add policy installer using Storage.writePolicy()"
```

---

## Chunk 3: Prompt Builders & Candidate File Gathering

### Task 6: Prompt Builder — `buildRecommenderPrompt()`

**Files:**
- Modify: `cli/src/onboard.ts`
- Test: `cli/src/__tests__/onboard.test.ts`

- [ ] **Step 1: Write failing test**

Append to `cli/src/__tests__/onboard.test.ts`:

```typescript
import { buildRecommenderPrompt } from "../onboard.js";

describe("buildRecommenderPrompt()", () => {
  it("includes repo tree, readme, and sample files in the prompt", () => {
    const scan: RepoScan = {
      tree: "src/\nblog/\n  post.md\n",
      readme: "# My Project\nA marketing site.",
      sampleFiles: ["blog/post.md (1200 bytes)"],
    };
    const policies: RegistryPolicy[] = [
      { name: "blog-post", description: "SEO blogs", usageHint: "Use for blogs", policy: {} },
    ];

    const prompt = buildRecommenderPrompt(scan, policies);

    expect(prompt).toContain("<repo_tree>");
    expect(prompt).toContain("src/");
    expect(prompt).toContain("<readme>");
    expect(prompt).toContain("My Project");
    expect(prompt).toContain("<sample_files>");
    expect(prompt).toContain("blog/post.md");
  });

  it("includes policy table with all entries", () => {
    const scan: RepoScan = { tree: "", readme: "", sampleFiles: [] };
    const policies: RegistryPolicy[] = [
      { name: "blog-post", description: "SEO blogs", usageHint: "Use for blogs", policy: {} },
      { name: "email-campaign", description: "Marketing emails", usageHint: "", policy: {} },
    ];

    const prompt = buildRecommenderPrompt(scan, policies);

    expect(prompt).toContain("blog-post");
    expect(prompt).toContain("email-campaign");
    expect(prompt).toContain("SEO blogs");
  });

  it("includes the JSON output format instruction", () => {
    const scan: RepoScan = { tree: "", readme: "", sampleFiles: [] };
    const prompt = buildRecommenderPrompt(scan, []);
    expect(prompt).toContain('"recommendations"');
    expect(prompt).toContain("Return ONLY valid JSON");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: FAIL — `buildRecommenderPrompt` not exported

- [ ] **Step 3: Implement `buildRecommenderPrompt()`**

Add to `cli/src/onboard.ts`. This assembles the full prompt from the spec's Prompt 1 template, injecting the dynamic repo data and the policy table built from manifests:

```typescript
export function buildRecommenderPrompt(
  scan: RepoScan,
  registryPolicies: RegistryPolicy[],
): string {
  const policyTable = registryPolicies
    .map((p) => `| ${p.name} | ${p.description} | ${p.usageHint || p.description} |`)
    .join("\n");

  return RECOMMENDER_PROMPT_TEMPLATE
    .replace("{{POLICY_TABLE}}", policyTable)
    .replace("{{REPO_TREE}}", scan.tree || "(empty project)")
    .replace("{{README_EXCERPT}}", scan.readme || "(no README found)")
    .replace("{{SAMPLE_FILES}}", scan.sampleFiles.join("\n") || "(no content files found)");
}
```

The `RECOMMENDER_PROMPT_TEMPLATE` is a const string literal containing the full Prompt 1 from the spec (`docs/superpowers/specs/2026-03-16-onboarding-flow-design.md`, lines 165-330). The policy table row is the only dynamic part — replace the static table in the template with `{{POLICY_TABLE}}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/onboard.ts cli/src/__tests__/onboard.test.ts
git commit -m "feat(onboard): add recommender prompt builder with dynamic policy table"
```

---

### Task 7: Candidate File Gatherer — `gatherCandidateFiles()`

**Files:**
- Modify: `cli/src/onboard.ts`
- Test: `cli/src/__tests__/onboard.test.ts`

- [ ] **Step 1: Write failing test**

Append to `cli/src/__tests__/onboard.test.ts`:

```typescript
import { gatherCandidateFiles } from "../onboard.js";

describe("gatherCandidateFiles()", () => {
  it("finds markdown files for text-based policies", () => {
    fs.mkdirSync(path.join(tmpDir, "content"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "content", "post.md"), "# Post");

    const files = gatherCandidateFiles(tmpDir, ["content-article"]);
    expect(files).toContain("content/post.md");
  });

  it("finds image files for image-based policies", () => {
    fs.mkdirSync(path.join(tmpDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "assets", "ad.png"), "fake-png");

    const files = gatherCandidateFiles(tmpDir, ["social-ad"]);
    expect(files).toContain("assets/ad.png");
  });

  it("finds .mjml and .html in email dirs for email policies", () => {
    fs.mkdirSync(path.join(tmpDir, "emails"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "emails", "welcome.mjml"), "<mjml>");

    const files = gatherCandidateFiles(tmpDir, ["email-campaign"]);
    expect(files).toContain("emails/welcome.mjml");
  });

  it("returns empty array when no files match", () => {
    const files = gatherCandidateFiles(tmpDir, ["blog-post"]);
    expect(files).toEqual([]);
  });

  it("limits results to 20 files", () => {
    fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });
    for (let i = 0; i < 30; i++) {
      fs.writeFileSync(path.join(tmpDir, "docs", `file-${i}.md`), `# File ${i}`);
    }

    const files = gatherCandidateFiles(tmpDir, ["content-article"]);
    expect(files.length).toBeLessThanOrEqual(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: FAIL — `gatherCandidateFiles` not exported

- [ ] **Step 3: Implement `gatherCandidateFiles()`**

Add to `cli/src/onboard.ts`:

```typescript
const TEXT_POLICIES = new Set([
  "blog-post", "content-article", "feature-announcement",
  "help-article", "landing-page", "product-description",
  "support-response", "onboarding-sequence",
]);
const IMAGE_POLICIES = new Set([
  "instagram-ad", "social-ad", "social-graphic", "brand-asset",
]);
const EMAIL_POLICIES = new Set(["email-campaign", "onboarding-sequence"]);
const SOCIAL_POLICIES = new Set(["social-post"]);

const TEXT_EXTS = new Set([".md", ".html", ".htm", ".txt"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".svg"]);
const EMAIL_EXTS = new Set([".html", ".htm", ".mjml"]);
const EMAIL_DIR_HINTS = ["email", "emails", "newsletter", "drip", "campaign", "templates"];

const MAX_CANDIDATES = 20;

export function gatherCandidateFiles(
  projectDir: string,
  installedPolicyNames: string[],
): string[] {
  const wantText = installedPolicyNames.some((n) => TEXT_POLICIES.has(n));
  const wantImage = installedPolicyNames.some((n) => IMAGE_POLICIES.has(n));
  const wantEmail = installedPolicyNames.some((n) => EMAIL_POLICIES.has(n));
  const wantSocial = installedPolicyNames.some((n) => SOCIAL_POLICIES.has(n));

  const candidates: string[] = [];
  walkForCandidates(projectDir, projectDir, 0, candidates, {
    wantText,
    wantImage,
    wantEmail,
    wantSocial,
  });

  return candidates.slice(0, MAX_CANDIDATES);
}

function walkForCandidates(
  root: string,
  dir: string,
  depth: number,
  out: string[],
  want: { wantText: boolean; wantImage: boolean; wantEmail: boolean; wantSocial: boolean },
): void {
  if (depth > MAX_TREE_DEPTH || out.length >= MAX_CANDIDATES) return;
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const dirName = path.basename(dir).toLowerCase();
  const isEmailDir = EMAIL_DIR_HINTS.some((h) => dirName.includes(h));

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    if (out.length >= MAX_CANDIDATES) return;
    const fullPath = path.join(dir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkForCandidates(root, fullPath, depth + 1, out, want);
    } else {
      const ext = path.extname(entry).toLowerCase();
      const rel = path.relative(root, fullPath);
      let matched = false;

      if (want.wantEmail && isEmailDir && EMAIL_EXTS.has(ext)) matched = true;
      if (want.wantText && TEXT_EXTS.has(ext) && !isEmailDir) matched = true;
      if (want.wantImage && IMAGE_EXTS.has(ext)) matched = true;
      if (want.wantSocial && (TEXT_EXTS.has(ext) || IMAGE_EXTS.has(ext))) matched = true;

      if (matched) out.push(rel);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/onboard.ts cli/src/__tests__/onboard.test.ts
git commit -m "feat(onboard): add candidate file gatherer with policy-type matching"
```

---

### Task 8: Prompt Generator Prompt Builder — `buildPromptGeneratorPrompt()`

**Files:**
- Modify: `cli/src/onboard.ts`
- Test: `cli/src/__tests__/onboard.test.ts`

- [ ] **Step 1: Write failing test**

Append to `cli/src/__tests__/onboard.test.ts`:

```typescript
import { buildPromptGeneratorPrompt } from "../onboard.js";

describe("buildPromptGeneratorPrompt()", () => {
  it("includes installed policy details", () => {
    const prompt = buildPromptGeneratorPrompt(
      [{ name: "blog-post", description: "SEO blogs", usageHint: "Use for blogs", policy: { stages: ["objective"] } }],
      ["content/post.md"],
      "A marketing website",
    );
    expect(prompt).toContain("blog-post");
    expect(prompt).toContain("<installed_policies>");
  });

  it("includes candidate files", () => {
    const prompt = buildPromptGeneratorPrompt(
      [{ name: "blog-post", description: "SEO blogs", usageHint: "", policy: {} }],
      ["content/post.md", "content/guide.md"],
      "",
    );
    expect(prompt).toContain("content/post.md");
    expect(prompt).toContain("content/guide.md");
  });

  it("includes project description", () => {
    const prompt = buildPromptGeneratorPrompt([], [], "A SaaS marketing site");
    expect(prompt).toContain("A SaaS marketing site");
    expect(prompt).toContain("<project_description>");
  });

  it("includes the JSON output format instruction", () => {
    const prompt = buildPromptGeneratorPrompt([], [], "");
    expect(prompt).toContain('"prompt"');
    expect(prompt).toContain("Return ONLY valid JSON");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: FAIL — `buildPromptGeneratorPrompt` not exported

- [ ] **Step 3: Implement `buildPromptGeneratorPrompt()`**

Add to `cli/src/onboard.ts`:

```typescript
export function buildPromptGeneratorPrompt(
  installedPolicies: RegistryPolicy[],
  candidateFiles: string[],
  projectDescription: string,
): string {
  const policyDetails = installedPolicies
    .map((p) => JSON.stringify({ name: p.name, description: p.description, usage_hint: p.usageHint, ...p.policy }, null, 2))
    .join("\n\n");

  return PROMPT_GENERATOR_TEMPLATE
    .replace("{{POLICY_DETAILS}}", policyDetails || "(no policies installed)")
    .replace("{{CANDIDATE_FILES}}", candidateFiles.join("\n") || "(no candidate files found)")
    .replace("{{PROJECT_DESCRIPTION}}", projectDescription || "(unknown project)");
}
```

The `PROMPT_GENERATOR_TEMPLATE` is a const string containing the full Prompt 2 from the spec (lines 335-459).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add cli/src/onboard.ts cli/src/__tests__/onboard.test.ts
git commit -m "feat(onboard): add prompt generator prompt builder"
```

---

## Chunk 4: Main Orchestrator & CLI Integration

### Task 9: Main Orchestrator — `onboard()`

**Files:**
- Modify: `cli/src/onboard.ts`

This is the top-level function that wires everything together. It is primarily an integration function — the individual pieces are already tested.

- [ ] **Step 1: Implement `onboard()`**

Add to `cli/src/onboard.ts`:

```typescript
import * as prompts from "@clack/prompts";
import pc from "picocolors";
import { fileURLToPath } from "node:url";

export interface OnboardResult {
  installedPolicies: string[];
  suggestedPrompt: string | null;
  suggestedExplanation: string | null;
}

export async function onboard(
  projectDir: string,
  storage: Storage,
): Promise<OnboardResult> {
  const result: OnboardResult = {
    installedPolicies: [],
    suggestedPrompt: null,
    suggestedExplanation: null,
  };

  console.log();
  console.log(
    `  ${pc.cyan(pc.bold("Smart onboarding"))} ${pc.dim("— analyzing your project to recommend review policies")}`
  );
  console.log();

  // 1. Resolve registry directory (relative to this package)
  const registryDir = resolveRegistryDir();
  if (!registryDir) {
    console.log(`  ${pc.yellow("!")}  Could not locate policy registry. Skipping onboarding.`);
    return result;
  }

  // 2. Scan repo
  const scan = scanRepo(projectDir);

  // 3. Load registry policy manifests
  const registryPolicies = loadRegistryPolicies(registryDir);
  if (registryPolicies.length === 0) {
    console.log(`  ${pc.yellow("!")}  No policies found in registry. Skipping onboarding.`);
    return result;
  }

  // 4. Call Claude for policy recommendations
  const s = prompts.spinner();
  s.start("Analyzing your project...");

  const recommenderPrompt = buildRecommenderPrompt(scan, registryPolicies);
  const rawRecommendation = await callClaude(recommenderPrompt);

  if (!rawRecommendation) {
    s.stop(pc.yellow("Could not reach Claude — skipping smart onboarding."));
    return result;
  }

  // 5. Parse the response (claude --output-format json wraps in { result: "..." })
  const outer = parseJsonResponse(rawRecommendation);
  const innerText = (outer as any)?.result ?? rawRecommendation;
  const inner = typeof innerText === "string" ? parseJsonResponse(innerText) : innerText;
  const recommendations: Array<{ policy: string; confidence: string; reason: string }> =
    (inner as any)?.recommendations ?? [];

  if (recommendations.length === 0) {
    s.stop(pc.yellow("No policy recommendations found for this project."));
    return result;
  }

  s.stop(`Found ${pc.bold(String(recommendations.length))} recommended ${recommendations.length === 1 ? "policy" : "policies"}`);

  // 6. Interactive confirmation (multiselect, all pre-selected)
  const selected = await prompts.multiselect({
    message: "Recommended policies for your project:",
    options: recommendations.map((r) => ({
      value: r.policy,
      label: `${r.policy} ${pc.dim(`(${r.confidence})`)}`,
      hint: r.reason,
    })),
    initialValues: recommendations.map((r) => r.policy),
  });

  if (prompts.isCancel(selected) || !Array.isArray(selected) || selected.length === 0) {
    return result;
  }

  // 7. Install selected policies
  result.installedPolicies = await installPolicies(storage, selected as string[], registryPolicies);

  if (result.installedPolicies.length > 0) {
    console.log(
      `  ${pc.green("✔")}  Installed ${pc.bold(String(result.installedPolicies.length))} ${result.installedPolicies.length === 1 ? "policy" : "policies"}: ${result.installedPolicies.join(", ")}`
    );
  }

  // 8. Gather candidate files for the prompt generator
  const candidateFiles = gatherCandidateFiles(projectDir, result.installedPolicies);

  // 9. Build project description from README first line or dir name
  const projectDescription = scan.readme.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "") || path.basename(projectDir);

  // 10. Call Claude for suggested prompt
  const s2 = prompts.spinner();
  s2.start("Generating a starter prompt...");

  const installedRegistryPolicies = registryPolicies.filter((p) =>
    result.installedPolicies.includes(p.name),
  );
  const promptGenPrompt = buildPromptGeneratorPrompt(
    installedRegistryPolicies,
    candidateFiles,
    projectDescription,
  );
  const rawPromptResult = await callClaude(promptGenPrompt);

  if (!rawPromptResult) {
    s2.stop(pc.yellow("Could not generate starter prompt."));
    return result;
  }

  const promptOuter = parseJsonResponse(rawPromptResult);
  const promptInnerText = (promptOuter as any)?.result ?? rawPromptResult;
  const promptInner = typeof promptInnerText === "string"
    ? parseJsonResponse(promptInnerText)
    : promptInnerText;
  const suggestion = promptInner as {
    prompt?: string;
    explanation?: string;
  } | null;

  if (suggestion?.prompt) {
    s2.stop("Ready!");
    result.suggestedPrompt = suggestion.prompt;
    result.suggestedExplanation = suggestion.explanation ?? null;
    printSuggestedPrompt(suggestion.prompt, suggestion.explanation ?? "");
  } else {
    s2.stop(pc.yellow("Could not generate starter prompt."));
  }

  return result;
}

function printSuggestedPrompt(prompt: string, explanation: string): void {
  const lines = prompt.split("\n");
  const maxLen = Math.max(...lines.map((l) => l.length), 40);
  const border = "─".repeat(maxLen + 2);

  console.log();
  console.log(`  ${pc.cyan("Try this prompt in Claude Code:")}`);
  console.log(`  ┌${border}┐`);
  for (const line of lines) {
    console.log(`  │ ${line.padEnd(maxLen)} │`);
  }
  console.log(`  └${border}┘`);
  if (explanation) {
    console.log(`  ${pc.dim(explanation)}`);
  }
  console.log();
}

function resolveRegistryDir(): string | null {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const candidates = [
    // Development: cli/src/ → registry/
    path.resolve(here, "../../registry"),
    // Bundled: cli/dist/ → registry/
    path.resolve(here, "../registry"),
    // Monorepo root: cli/dist/ → ../../registry/
    path.resolve(here, "../../../registry"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "policies"))) return dir;
  }
  return null;
}
```

- [ ] **Step 2: Verify the full test suite still passes**

Run: `pnpm test:run -- cli/src/__tests__/onboard.test.ts`
Expected: All existing tests PASS (no regressions)

- [ ] **Step 3: Commit**

```bash
git add cli/src/onboard.ts
git commit -m "feat(onboard): add main onboard() orchestrator with interactive flow"
```

---

### Task 10: CLI Integration — Wire `onboard()` into `index.ts`

**Files:**
- Modify: `cli/src/index.ts`

- [ ] **Step 1: Add `--onboard` option and import**

At the top of `cli/src/index.ts`, add the import:

```typescript
import { onboard } from "./onboard.js";
```

Add the `.option()` to the default command (before `.action()`):

```typescript
program
  .argument("[project]", "Project directory")
  .option("--onboard", "Run smart policy onboarding on first run", true)
  .action(async (projectArg: string | undefined, opts: { onboard: boolean }) => {
```

- [ ] **Step 2: Call `onboard()` after `storage.init()` when it's a first run**

Inside the action handler, after `storage.init()` and before the first-run MCP setup, add:

```typescript
    if (!wasInitialized) {
      await storage.init();
    }

    // Smart onboarding: recommend policies on first run
    if (!wasInitialized && opts.onboard) {
      await onboard(projectDir, storage);
    }
```

The key condition is `!wasInitialized && opts.onboard` — only run on first init, and only if not disabled via `--no-onboard`.

- [ ] **Step 3: Verify the CLI builds**

Run: `pnpm -C cli build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add cli/src/index.ts
git commit -m "feat(onboard): wire onboard() into CLI first-run flow with --no-onboard flag"
```

---

### Task 11: Build — Bundle Registry Manifests

**Files:**
- Modify: `cli/tsup.config.ts`

The registry policy manifests need to be accessible from the bundled CLI. Since tsup only bundles JS, we need a post-build copy step.

- [ ] **Step 1: Add `onSuccess` copy step to tsup config**

Modify `cli/tsup.config.ts` to copy manifests after build:

```typescript
import { defineConfig } from "tsup";
import { builtinModules } from "node:module";
import { cpSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ... existing config ...

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    // ... existing options ...
    onSuccess: async () => {
      // Copy registry policy manifests into dist/registry/
      const src = resolve(__dirname, "../registry/policies");
      const dest = resolve(__dirname, "dist/registry/policies");
      mkdirSync(dest, { recursive: true });
      cpSync(src, dest, { recursive: true });
    },
  },
  {
    entry: { "mcp-entry": "src/mcp-entry.ts" },
    // ... existing options unchanged ...
  },
]);
```

- [ ] **Step 2: Rebuild and verify registry is copied**

Run: `pnpm -C cli build && ls cli/dist/registry/policies/`
Expected: All 14 policy directories are present (blog-post, content-article, email-campaign, etc.)

- [ ] **Step 3: Commit**

```bash
git add cli/tsup.config.ts
git commit -m "build: copy registry policy manifests into CLI dist for bundled distribution"
```

---

### Task 12: Manual Integration Test

- [ ] **Step 1: Clean slate test**

Remove `.aros/` from a test project directory (or use a fresh temp dir) and run:

```bash
node cli/dist/index.js /path/to/test-project
```

Expected behavior:
1. `.aros/` is created
2. "Smart onboarding — analyzing your project" message appears
3. Spinner shows "Analyzing your project..."
4. Multiselect appears with recommended policies (pre-selected)
5. After confirming, policies are installed
6. Spinner shows "Generating a starter prompt..."
7. A boxed prompt appears with a ready-to-paste suggestion
8. The normal first-run MCP setup prompts follow
9. Server starts and banner prints

- [ ] **Step 2: Test `--no-onboard` flag**

```bash
rm -rf /tmp/aros-test/.aros
node cli/dist/index.js --no-onboard /tmp/aros-test
```

Expected: No onboarding prompts, goes straight to MCP setup.

- [ ] **Step 3: Test without claude CLI**

```bash
PATH=/usr/bin:/bin node cli/dist/index.js /tmp/aros-test2
```

Expected: "Could not reach Claude" message, graceful skip to MCP setup.

- [ ] **Step 4: Commit any fixes from integration testing**

```bash
git add -u
git commit -m "fix(onboard): address issues found during integration testing"
```
