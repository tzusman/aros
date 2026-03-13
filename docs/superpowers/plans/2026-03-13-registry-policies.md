# Registry Policies Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full ecommerce/SaaS startup policy suite — 8 new checks, 14 new criteria, 8 enhanced criteria, 12 policies, and the `usage_hint` schema extension.

**Architecture:** The AROS registry is a flat file system at `registry/` with three categories: `checks/` (manifest.json + check.ts), `criteria/` (manifest.json only), and `policies/` (manifest.json only). Policies compose checks and criteria by name. At install time, modules are copied to `.aros/modules/`. Checks are compiled from TS to JS via esbuild before execution.

**Tech Stack:** TypeScript, Vitest, Zod schemas, Express routes, Anthropic SDK for subjective evaluation.

**Spec:** `docs/superpowers/specs/2026-03-13-registry-policies-design.md` — the source of truth for all prompt guidance text, policy compositions, and check configs. The implementing agent MUST read this file for the `promptGuidance` content of each criterion.

---

## Chunk 1: Schema + Infrastructure

### Task 1: Add `usage_hint` to policy manifest schema

**Files:**
- Modify: `server/src/modules/schemas.ts:93-100`

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__/schema-usage-hint.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/schema-usage-hint.test.ts`
Expected: FAIL — `usage_hint` not recognized by schema

- [ ] **Step 3: Add `usage_hint` to the schema**

In `server/src/modules/schemas.ts`, change the `policyManifestSchema` definition:

```typescript
export const policyManifestSchema = baseManifest.extend({
  type: z.literal("policy"),
  usage_hint: z.string().optional(),
  requires: z.object({
    checks: z.array(z.string()).default([]),
    criteria: z.array(z.string()).default([]),
  }),
  policy: policyBody,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/__tests__/schema-usage-hint.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add server/src/modules/schemas.ts server/src/__tests__/schema-usage-hint.test.ts
git commit -m "feat: add optional usage_hint field to policy manifest schema"
```

---

### Task 2: Surface `usage_hint` in list_policies MCP tool

**Files:**
- Modify: `mcp/src/tools/list-policies.ts:14-23`

- [ ] **Step 1: Update the tool to read usage_hint from installed policy manifest**

The `list_policies` tool currently reads from `storage.readPolicy()` which returns the `policy` body (a `PolicyConfig`), not the full manifest. The `usage_hint` lives on the outer manifest. We need to also read the manifest from `.aros/modules/policies/{name}/manifest.json`.

In `mcp/src/tools/list-policies.ts`, update the mapping:

```typescript
import * as fs from "fs";
import * as path from "path";

// Inside the tool handler, replace the names.map block:
const policies = await Promise.all(
  names.map(async (name) => {
    const config = await storage.readPolicy(name);
    // Read full manifest for usage_hint
    let usage_hint: string | undefined;
    try {
      const manifestPath = path.join(
        storage.projectDir, ".aros", "modules", "policies", name, "manifest.json"
      );
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      usage_hint = manifest.usage_hint;
    } catch { /* no manifest — installed before usage_hint existed */ }
    return {
      name: config.name,
      usage_hint,
      stages: config.stages,
      max_revisions: config.max_revisions,
      objective_checks: config.objective?.checks?.map((c) => c.name) ?? [],
      subjective_criteria: config.subjective?.criteria?.map((c) => c.name) ?? [],
      pass_threshold: config.subjective?.pass_threshold ?? null,
    };
  })
);
```

- [ ] **Step 2: Verify the server still builds**

Run: `cd mcp && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```
git add mcp/src/tools/list-policies.ts
git commit -m "feat: surface usage_hint in list_policies MCP tool"
```

---

## Chunk 2: New Checks

All new checks follow the same pattern: `registry/checks/{name}/manifest.json` + `registry/checks/{name}/check.ts`. Tests go in `server/src/__tests__/registry-checks.test.ts`.

### Task 3: Create test file scaffold for all new checks

**Files:**
- Create: `server/src/__tests__/registry-checks.test.ts`

- [ ] **Step 1: Create the test file with imports**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import type { CheckContext } from "@aros/types";

function makeCtx(overrides: Partial<CheckContext> & { files: CheckContext["files"] }): CheckContext {
  return { config: {}, brief: "", projectDir: "/tmp", ...overrides };
}

function textFile(filename: string, content: string) {
  return { filename, content, contentType: "text/markdown", sizeBytes: content.length };
}

function svgFile(filename: string, content: string) {
  return { filename, content, contentType: "image/svg+xml", sizeBytes: content.length };
}

// Tests will be added per check in subsequent tasks
```

- [ ] **Step 2: Commit scaffold**

```
git add server/src/__tests__/registry-checks.test.ts
git commit -m "test: scaffold registry checks test file"
```

---

### Task 4: `placeholder-detection` check

**Files:**
- Create: `registry/checks/placeholder-detection/manifest.json`
- Create: `registry/checks/placeholder-detection/check.ts`
- Modify: `server/src/__tests__/registry-checks.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `server/src/__tests__/registry-checks.test.ts`:

```typescript
describe("placeholder-detection", () => {
  let mod: { execute: (ctx: CheckContext) => Promise<any[]> };
  beforeAll(async () => {
    mod = (await import("../../../registry/checks/placeholder-detection/check.ts")).default;
  });

  it("detects [INSERT] tokens", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Welcome to [INSERT COMPANY NAME]")],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("[INSERT COMPANY NAME]");
  });

  it("detects lorem ipsum", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Lorem ipsum dolor sit amet")],
    }));
    expect(results[0].passed).toBe(false);
  });

  it("detects example.com", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Visit us at https://example.com")],
    }));
    expect(results[0].passed).toBe(false);
  });

  it("detects template variables {{var}}", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Hello {{user_name}}, welcome!")],
    }));
    expect(results[0].passed).toBe(false);
  });

  it("passes clean content", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Welcome to Acme Corp. We build great products.")],
    }));
    expect(results[0].passed).toBe(true);
  });

  it("supports custom patterns", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Price: $PRICE_HERE")],
      config: { custom_patterns: ["\\$PRICE_HERE"] },
    }));
    expect(results[0].passed).toBe(false);
  });

  it("detects placeholders in SVG text", async () => {
    const results = await mod.execute({
      files: [svgFile("ad.svg", '<svg><text>[TODO: Add headline]</text></svg>')],
      config: {}, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/registry-checks.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create manifest.json**

Create `registry/checks/placeholder-detection/manifest.json`:

```json
{
  "name": "placeholder-detection",
  "type": "check",
  "version": "1.0.0",
  "description": "Scans for unreplaced template tokens, dummy content, and development artifacts",
  "supportedTypes": ["text/*", "image/svg+xml"],
  "configSchema": {
    "custom_patterns": {
      "type": "array",
      "items": { "type": "string" },
      "default": [],
      "description": "Additional regex patterns to flag"
    }
  },
  "dependencies": { "binaries": [], "env": [], "npm": [] },
  "entrypoint": "check.ts"
}
```

- [ ] **Step 4: Implement check.ts**

Create `registry/checks/placeholder-detection/check.ts`:

```typescript
import type { CheckContext, CheckResult } from "@aros/types";

const DEFAULT_PATTERNS = [
  /\[INSERT.*?\]/gi,
  /\[TODO.*?\]/gi,
  /\[TBD\]/gi,
  /\blorem ipsum\b/gi,
  /\bfoo\.com\b/gi,
  /\bexample\.(com|org|net)\b/gi,
  /\bXXX\b/g,
  /\basdf\b/gi,
  /\{\{.*?\}\}/g,
  /<your .+? here>/gi,
];

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const customPatterns = ((ctx.config.custom_patterns as string[]) ?? []).map(
      (p) => new RegExp(p, "gi")
    );
    const allPatterns = [...DEFAULT_PATTERNS, ...customPatterns];

    return ctx.files.map((file) => {
      const text =
        typeof file.content === "string"
          ? file.content
          : file.content.toString("utf-8");

      const found: string[] = [];
      for (const pattern of allPatterns) {
        pattern.lastIndex = 0;
        const matches = text.match(pattern);
        if (matches) found.push(...matches);
      }

      return {
        name: "placeholder-detection",
        file: file.filename,
        passed: found.length === 0,
        details:
          found.length === 0
            ? "No placeholder content detected."
            : `Found ${found.length} placeholder(s): ${found.slice(0, 5).join(", ")}${found.length > 5 ? ` (+${found.length - 5} more)` : ""}`,
        suggestions: found.length > 0 ? ["Replace all placeholder content before publishing."] : undefined,
      };
    });
  },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/registry-checks.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```
git add registry/checks/placeholder-detection/ server/src/__tests__/registry-checks.test.ts
git commit -m "feat: add placeholder-detection check"
```

---

### Task 5: `link-validation` check

**Files:**
- Create: `registry/checks/link-validation/manifest.json`
- Create: `registry/checks/link-validation/check.ts`
- Modify: `server/src/__tests__/registry-checks.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `server/src/__tests__/registry-checks.test.ts`:

```typescript
describe("link-validation", () => {
  let mod: { execute: (ctx: CheckContext) => Promise<any[]> };
  beforeAll(async () => {
    mod = (await import("../../../registry/checks/link-validation/check.ts")).default;
  });

  it("detects placeholder domain URLs", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Visit https://example.com/product")],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("example.com");
  });

  it("detects bare protocol", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Link: http://")],
    }));
    expect(results[0].passed).toBe(false);
  });

  it("detects mailto: with no address", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Email us at mailto:")],
    }));
    expect(results[0].passed).toBe(false);
  });

  it("detects URLs with TODO", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "See https://acme.com/TODO-fix-this")],
    }));
    expect(results[0].passed).toBe(false);
  });

  it("passes valid URLs", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Visit https://acme.com/products and https://acme.com/about")],
    }));
    expect(results[0].passed).toBe(true);
  });

  it("passes content with no URLs", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Just some text with no links.")],
    }));
    expect(results[0].passed).toBe(true);
  });

  it("detects broken anchor links", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "See the [details](#nonexistent-section) for more info.\n\n## Intro\n\nText here")],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("nonexistent-section");
  });

  it("passes valid anchor links", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "See the [details](#intro) for more info.\n\n## Intro\n\nText here")],
    }));
    expect(results[0].passed).toBe(true);
  });

  it("allows localhost when configured", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Test at http://localhost:3000")],
      config: { allow_localhost: true },
    }));
    expect(results[0].passed).toBe(true);
  });

  it("blocks localhost by default", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Test at http://localhost:3000")],
    }));
    expect(results[0].passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/registry-checks.test.ts`
Expected: FAIL

- [ ] **Step 3: Create manifest.json**

Create `registry/checks/link-validation/manifest.json`:

```json
{
  "name": "link-validation",
  "type": "check",
  "version": "1.0.0",
  "description": "Detects URLs that are broken, placeholder, or structurally malformed",
  "supportedTypes": ["text/*"],
  "configSchema": {
    "allow_localhost": {
      "type": "boolean",
      "default": false,
      "description": "Whether to allow localhost URLs"
    },
    "blocked_domains": {
      "type": "array",
      "items": { "type": "string" },
      "default": ["example.com", "test.com", "foo.com", "yoursite.com"],
      "description": "Domains to flag as placeholder"
    }
  },
  "dependencies": { "binaries": [], "env": [], "npm": [] },
  "entrypoint": "check.ts"
}
```

- [ ] **Step 4: Implement check.ts**

Create `registry/checks/link-validation/check.ts`:

```typescript
import type { CheckContext, CheckResult } from "@aros/types";

const URL_REGEX = /(?:https?:\/\/|mailto:)[^\s)<>"'`]*/gi;
const ANCHOR_REGEX = /\(#([a-zA-Z0-9_-]+)\)/g;

function extractHeadingIds(text: string): Set<string> {
  const ids = new Set<string>();
  // Markdown headings → slug (lowercase, spaces to hyphens, strip non-alphanum)
  for (const match of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const slug = match[1].trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
    ids.add(slug);
  }
  // HTML id attributes
  for (const match of text.matchAll(/\bid=["']([^"']+)["']/g)) {
    ids.add(match[1]);
  }
  return ids;
}

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const allowLocalhost = (ctx.config.allow_localhost as boolean) ?? false;
    const blockedDomains = (ctx.config.blocked_domains as string[]) ?? [
      "example.com", "test.com", "foo.com", "yoursite.com",
    ];

    return ctx.files.map((file) => {
      if (typeof file.content !== "string") {
        return { name: "link-validation", file: file.filename, passed: true, details: "Skipped — binary content." };
      }

      const urls = file.content.match(URL_REGEX) ?? [];
      const anchors = [...file.content.matchAll(ANCHOR_REGEX)].map((m) => m[1]);
      if (urls.length === 0 && anchors.length === 0) {
        return { name: "link-validation", file: file.filename, passed: true, details: "No URLs found." };
      }

      const issues: string[] = [];

      // Check anchor links against heading IDs
      if (anchors.length > 0) {
        const headingIds = extractHeadingIds(file.content);
        for (const anchor of anchors) {
          if (!headingIds.has(anchor)) {
            issues.push(`Broken anchor: #${anchor}`);
          }
        }
      }

      for (const url of urls) {
        // Bare protocol
        if (/^https?:\/\/?$/.test(url)) {
          issues.push(`Bare protocol: ${url}`);
          continue;
        }
        // mailto: with no address
        if (/^mailto:?\s*$/.test(url)) {
          issues.push(`Empty mailto: ${url}`);
          continue;
        }
        // URL contains TODO or INSERT
        if (/TODO|INSERT/i.test(url)) {
          issues.push(`Placeholder URL: ${url}`);
          continue;
        }
        // Localhost
        if (!allowLocalhost && /localhost|127\.0\.0\.1/i.test(url)) {
          issues.push(`Localhost URL: ${url}`);
          continue;
        }
        // Blocked domains
        for (const domain of blockedDomains) {
          if (url.toLowerCase().includes(domain.toLowerCase())) {
            issues.push(`Placeholder domain (${domain}): ${url}`);
            break;
          }
        }
      }

      return {
        name: "link-validation",
        file: file.filename,
        passed: issues.length === 0,
        details: issues.length === 0
          ? `${urls.length} URL(s) validated — no issues found.`
          : `${issues.length} issue(s): ${issues.join("; ")}`,
        suggestions: issues.length > 0 ? ["Replace all placeholder URLs with real destination links."] : undefined,
      };
    });
  },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/registry-checks.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```
git add registry/checks/link-validation/ server/src/__tests__/registry-checks.test.ts
git commit -m "feat: add link-validation check"
```

---

### Task 6: `heading-structure` check

**Files:**
- Create: `registry/checks/heading-structure/manifest.json`
- Create: `registry/checks/heading-structure/check.ts`
- Modify: `server/src/__tests__/registry-checks.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `server/src/__tests__/registry-checks.test.ts`:

```typescript
describe("heading-structure", () => {
  let mod: { execute: (ctx: CheckContext) => Promise<any[]> };
  beforeAll(async () => {
    mod = (await import("../../../registry/checks/heading-structure/check.ts")).default;
  });

  it("passes valid heading hierarchy", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "# Title\n\nIntro text\n\n## Section\n\nBody\n\n### Sub\n\nMore")],
    }));
    expect(results[0].passed).toBe(true);
  });

  it("fails when H1 is missing", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "## Section\n\nBody text")],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("H1");
  });

  it("fails when heading levels are skipped", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "# Title\n\n### Skipped H2\n\nBody")],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("skip");
  });

  it("fails when multiple H1s present", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "# Title\n\nText\n\n# Another Title\n\nMore")],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("H1");
  });

  it("allows skip levels when configured", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "# Title\n\n### Skipped H2\n\nBody")],
      config: { allow_skip_levels: true },
    }));
    expect(results[0].passed).toBe(true);
  });

  it("handles HTML headings", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.html", "<h1>Title</h1><p>Intro</p><h2>Section</h2>")],
    }));
    expect(results[0].passed).toBe(true);
  });

  it("warns on heading-only content with no body text between", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "# Title\n## Section One\n## Section Two\n### Sub")],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("no body text");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/registry-checks.test.ts`
Expected: FAIL

- [ ] **Step 3: Create manifest.json**

Create `registry/checks/heading-structure/manifest.json`:

```json
{
  "name": "heading-structure",
  "type": "check",
  "version": "1.0.0",
  "description": "Validates heading hierarchy in markdown or HTML content",
  "supportedTypes": ["text/*"],
  "configSchema": {
    "require_h1": { "type": "boolean", "default": true },
    "max_h1_count": { "type": "number", "default": 1 },
    "allow_skip_levels": { "type": "boolean", "default": false }
  },
  "dependencies": { "binaries": [], "env": [], "npm": [] },
  "entrypoint": "check.ts"
}
```

- [ ] **Step 4: Implement check.ts**

Create `registry/checks/heading-structure/check.ts`:

```typescript
import type { CheckContext, CheckResult } from "@aros/types";

function extractHeadings(text: string): number[] {
  const levels: number[] = [];
  // Markdown headings: # through ######
  for (const match of text.matchAll(/^(#{1,6})\s+/gm)) {
    levels.push(match[1].length);
  }
  // HTML headings: <h1> through <h6>
  for (const match of text.matchAll(/<h([1-6])\b/gi)) {
    levels.push(parseInt(match[1], 10));
  }
  return levels;
}

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const requireH1 = (ctx.config.require_h1 as boolean) ?? true;
    const maxH1 = (ctx.config.max_h1_count as number) ?? 1;
    const allowSkip = (ctx.config.allow_skip_levels as boolean) ?? false;

    return ctx.files.map((file) => {
      if (typeof file.content !== "string") {
        return { name: "heading-structure", file: file.filename, passed: true, details: "Skipped — binary content." };
      }

      const levels = extractHeadings(file.content);
      if (levels.length === 0) {
        return {
          name: "heading-structure",
          file: file.filename,
          passed: !requireH1,
          details: requireH1 ? "No headings found — H1 is required." : "No headings found.",
        };
      }

      const issues: string[] = [];

      // Check H1 presence and count
      const h1Count = levels.filter((l) => l === 1).length;
      if (requireH1 && h1Count === 0) {
        issues.push("Missing H1 heading");
      }
      if (h1Count > maxH1) {
        issues.push(`Found ${h1Count} H1 headings (max ${maxH1})`);
      }

      // Check for skipped levels
      if (!allowSkip) {
        for (let i = 1; i < levels.length; i++) {
          if (levels[i] > levels[i - 1] + 1) {
            issues.push(`Heading level skip: H${levels[i - 1]} → H${levels[i]}`);
          }
        }
      }

      // Check for heading-only content (no body text between headings)
      const lines = file.content.split("\n");
      let consecutiveHeadings = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue; // skip blank lines
        if (/^#{1,6}\s+/.test(trimmed) || /^<h[1-6]\b/i.test(trimmed)) {
          consecutiveHeadings++;
          if (consecutiveHeadings >= 3) {
            issues.push("Multiple consecutive headings with no body text between them");
            break;
          }
        } else {
          consecutiveHeadings = 0;
        }
      }

      return {
        name: "heading-structure",
        file: file.filename,
        passed: issues.length === 0,
        details: issues.length === 0
          ? `${levels.length} headings with valid hierarchy.`
          : issues.join("; "),
        suggestions: issues.length > 0
          ? ["Ensure headings follow a sequential hierarchy (H1 → H2 → H3) without skipping levels."]
          : undefined,
      };
    });
  },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/registry-checks.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```
git add registry/checks/heading-structure/ server/src/__tests__/registry-checks.test.ts
git commit -m "feat: add heading-structure check"
```

---

### Task 7: `subject-line-length` check

**Files:**
- Create: `registry/checks/subject-line-length/manifest.json`
- Create: `registry/checks/subject-line-length/check.ts`
- Modify: `server/src/__tests__/registry-checks.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `server/src/__tests__/registry-checks.test.ts`:

```typescript
describe("subject-line-length", () => {
  let mod: { execute: (ctx: CheckContext) => Promise<any[]> };
  beforeAll(async () => {
    mod = (await import("../../../registry/checks/subject-line-length/check.ts")).default;
  });

  it("passes subject line in range", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("email.md", "Your order ships tomorrow\nPreview text here\n\nBody content")],
    }));
    expect(results[0].passed).toBe(true);
  });

  it("fails subject line too long", async () => {
    const long = "A".repeat(80);
    const results = await mod.execute(makeCtx({
      files: [textFile("email.md", `${long}\nPreview\n\nBody`)],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("80");
  });

  it("fails subject line too short", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("email.md", "Hi\nPreview\n\nBody")],
      config: { min_chars: 10 },
    }));
    expect(results[0].passed).toBe(false);
  });

  it("uses custom config", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("email.md", "Short but ok\nPreview\n\nBody")],
      config: { min_chars: 5, max_chars: 20 },
    }));
    expect(results[0].passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/__tests__/registry-checks.test.ts`
Expected: FAIL

- [ ] **Step 3: Create manifest.json**

Create `registry/checks/subject-line-length/manifest.json`:

```json
{
  "name": "subject-line-length",
  "type": "check",
  "version": "1.0.0",
  "description": "Validates email subject line character count for deliverability and open rates",
  "supportedTypes": ["text/*"],
  "configSchema": {
    "min_chars": { "type": "number", "default": 20 },
    "max_chars": { "type": "number", "default": 60 },
    "field": { "type": "string", "default": "subject" }
  },
  "dependencies": { "binaries": [], "env": [], "npm": [] },
  "entrypoint": "check.ts"
}
```

- [ ] **Step 4: Implement check.ts**

Create `registry/checks/subject-line-length/check.ts`:

```typescript
import type { CheckContext, CheckResult } from "@aros/types";

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const minChars = (ctx.config.min_chars as number) ?? 20;
    const maxChars = (ctx.config.max_chars as number) ?? 60;

    return ctx.files.map((file) => {
      if (typeof file.content !== "string") {
        return { name: "subject-line-length", file: file.filename, passed: true, details: "Skipped — binary content." };
      }

      // Subject is the first line of the file (per input format convention)
      const firstLine = file.content.split("\n")[0]?.trim() ?? "";
      const len = firstLine.length;

      return {
        name: "subject-line-length",
        file: file.filename,
        passed: len >= minChars && len <= maxChars,
        details: `Subject line: ${len} characters (allowed: ${minChars}–${maxChars})`,
        suggestions:
          len > maxChars
            ? [`Shorten subject by ${len - maxChars} characters — long subjects get truncated on mobile.`]
            : len < minChars
              ? [`Subject line is too short (${len} chars) — aim for at least ${minChars} characters.`]
              : undefined,
      };
    });
  },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx vitest run src/__tests__/registry-checks.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```
git add registry/checks/subject-line-length/ server/src/__tests__/registry-checks.test.ts
git commit -m "feat: add subject-line-length check"
```

---

### Task 8: `meta-length` check

**Files:**
- Create: `registry/checks/meta-length/manifest.json`
- Create: `registry/checks/meta-length/check.ts`
- Modify: `server/src/__tests__/registry-checks.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `server/src/__tests__/registry-checks.test.ts`:

```typescript
describe("meta-length", () => {
  let mod: { execute: (ctx: CheckContext) => Promise<any[]> };
  beforeAll(async () => {
    mod = (await import("../../../registry/checks/meta-length/check.ts")).default;
  });

  it("passes valid frontmatter meta", async () => {
    const content = `---\nmeta_title: ${" ".repeat(0)}${"A".repeat(55)}\nmeta_description: ${"B".repeat(150)}\n---\n# Page`;
    const results = await mod.execute(makeCtx({ files: [textFile("page.md", content)] }));
    expect(results[0].passed).toBe(true);
  });

  it("fails meta_title too long", async () => {
    const content = `---\nmeta_title: ${"A".repeat(80)}\nmeta_description: ${"B".repeat(150)}\n---\n# Page`;
    const results = await mod.execute(makeCtx({ files: [textFile("page.md", content)] }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("title");
  });

  it("fails meta_description too short", async () => {
    const content = `---\nmeta_title: ${"A".repeat(55)}\nmeta_description: Short\n---\n# Page`;
    const results = await mod.execute(makeCtx({ files: [textFile("page.md", content)] }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("description");
  });

  it("falls back to H1 and first paragraph when no frontmatter", async () => {
    const title = "A".repeat(55);
    const desc = "B".repeat(150);
    const content = `# ${title}\n\n${desc}\n\nMore content here.`;
    const results = await mod.execute(makeCtx({ files: [textFile("page.md", content)] }));
    expect(results[0].passed).toBe(true);
  });

  it("passes when no meta found (skip)", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Just some text with no headings or frontmatter.")],
    }));
    expect(results[0].passed).toBe(true);
    expect(results[0].details).toContain("skip");
  });
});
```

- [ ] **Step 2: Run tests, create manifest, implement, run tests, commit**

Create `registry/checks/meta-length/manifest.json`:

```json
{
  "name": "meta-length",
  "type": "check",
  "version": "1.0.0",
  "description": "Validates SEO meta title and description character counts",
  "supportedTypes": ["text/*"],
  "configSchema": {
    "title_min": { "type": "number", "default": 50 },
    "title_max": { "type": "number", "default": 60 },
    "desc_min": { "type": "number", "default": 140 },
    "desc_max": { "type": "number", "default": 160 }
  },
  "dependencies": { "binaries": [], "env": [], "npm": [] },
  "entrypoint": "check.ts"
}
```

Create `registry/checks/meta-length/check.ts`:

```typescript
import type { CheckContext, CheckResult } from "@aros/types";

function extractMeta(text: string): { title?: string; description?: string } {
  // Try YAML frontmatter first
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const titleMatch = fm.match(/^meta_title:\s*(.+)$/m);
    const descMatch = fm.match(/^meta_description:\s*(.+)$/m);
    if (titleMatch || descMatch) {
      return {
        title: titleMatch?.[1]?.trim(),
        description: descMatch?.[1]?.trim(),
      };
    }
  }

  // Fallback: H1 for title, first paragraph for description
  const h1Match = text.match(/^#\s+(.+)$/m);
  const paragraphs = text
    .replace(/^---[\s\S]*?---\n?/, "")
    .replace(/^#+\s+.+$/gm, "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return {
    title: h1Match?.[1]?.trim(),
    description: paragraphs[0],
  };
}

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const titleMin = (ctx.config.title_min as number) ?? 50;
    const titleMax = (ctx.config.title_max as number) ?? 60;
    const descMin = (ctx.config.desc_min as number) ?? 140;
    const descMax = (ctx.config.desc_max as number) ?? 160;

    return ctx.files.map((file) => {
      if (typeof file.content !== "string") {
        return { name: "meta-length", file: file.filename, passed: true, details: "Skipped — binary content." };
      }

      const meta = extractMeta(file.content);
      if (!meta.title && !meta.description) {
        return { name: "meta-length", file: file.filename, passed: true, details: "No meta title or description found — skipped." };
      }

      const issues: string[] = [];
      if (meta.title) {
        const len = meta.title.length;
        if (len < titleMin) issues.push(`Meta title too short: ${len} chars (min ${titleMin})`);
        if (len > titleMax) issues.push(`Meta title too long: ${len} chars (max ${titleMax})`);
      }
      if (meta.description) {
        const len = meta.description.length;
        if (len < descMin) issues.push(`Meta description too short: ${len} chars (min ${descMin})`);
        if (len > descMax) issues.push(`Meta description too long: ${len} chars (max ${descMax})`);
      }

      return {
        name: "meta-length",
        file: file.filename,
        passed: issues.length === 0,
        details: issues.length === 0
          ? `Meta title: ${meta.title?.length ?? "n/a"} chars, description: ${meta.description?.length ?? "n/a"} chars — within limits.`
          : issues.join("; "),
        suggestions: issues.length > 0 ? ["Adjust meta title (50-60 chars) and description (140-160 chars) for optimal search snippet display."] : undefined,
      };
    });
  },
};
```

- [ ] **Step 3: Run tests, commit**

Run: `cd server && npx vitest run src/__tests__/registry-checks.test.ts`
Expected: PASS

```
git add registry/checks/meta-length/ server/src/__tests__/registry-checks.test.ts
git commit -m "feat: add meta-length check"
```

---

### Task 9: `required-sections` check

**Files:**
- Create: `registry/checks/required-sections/manifest.json`
- Create: `registry/checks/required-sections/check.ts`
- Modify: `server/src/__tests__/registry-checks.test.ts`

- [ ] **Step 1: Write tests, implement, verify**

Tests to append:

```typescript
describe("required-sections", () => {
  let mod: { execute: (ctx: CheckContext) => Promise<any[]> };
  beforeAll(async () => {
    mod = (await import("../../../registry/checks/required-sections/check.ts")).default;
  });

  it("passes when all sections present", async () => {
    const content = "# Headline\n\n## Subheadline\n\nText\n\n## Call to Action\n\nBuy now\n\n## Social Proof\n\n5 stars";
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", content)],
      config: { sections: ["headline", "subheadline", "call to action", "social proof"] },
    }));
    expect(results[0].passed).toBe(true);
  });

  it("fails when sections are missing", async () => {
    const content = "# Headline\n\n## Subheadline\n\nText";
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", content)],
      config: { sections: ["headline", "subheadline", "call to action", "social proof"] },
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("call to action");
    expect(results[0].details).toContain("social proof");
  });

  it("is case-insensitive", async () => {
    const content = "## CALL TO ACTION\n\nBuy now";
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", content)],
      config: { sections: ["call to action"] },
    }));
    expect(results[0].passed).toBe(true);
  });

  it("finds sections in JSON keys", async () => {
    const content = JSON.stringify({ title: "Product", description: "Great", features: ["Fast"] });
    const results = await mod.execute(makeCtx({
      files: [textFile("listing.json", content)],
      config: { sections: ["title", "description", "features"] },
    }));
    expect(results[0].passed).toBe(true);
  });
});
```

Create `registry/checks/required-sections/manifest.json`:

```json
{
  "name": "required-sections",
  "type": "check",
  "version": "1.0.0",
  "description": "Validates that named sections or fields are present in the deliverable",
  "supportedTypes": ["text/*"],
  "configSchema": {
    "sections": {
      "type": "array",
      "items": { "type": "string" },
      "default": [],
      "description": "Section headings or field names that must be present"
    }
  },
  "dependencies": { "binaries": [], "env": [], "npm": [] },
  "entrypoint": "check.ts"
}
```

Create `registry/checks/required-sections/check.ts`:

```typescript
import type { CheckContext, CheckResult } from "@aros/types";

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const required = (ctx.config.sections as string[]) ?? [];
    if (required.length === 0) {
      return ctx.files.map((file) => ({
        name: "required-sections",
        file: file.filename,
        passed: true,
        details: "No required sections configured — skipped.",
      }));
    }

    return ctx.files.map((file) => {
      if (typeof file.content !== "string") {
        return { name: "required-sections", file: file.filename, passed: true, details: "Skipped — binary content." };
      }

      const lower = file.content.toLowerCase();
      const missing = required.filter((s) => !lower.includes(s.toLowerCase()));

      return {
        name: "required-sections",
        file: file.filename,
        passed: missing.length === 0,
        details: missing.length === 0
          ? `All ${required.length} required sections found.`
          : `Missing ${missing.length} section(s): ${missing.join(", ")}`,
        suggestions: missing.length > 0
          ? [`Add the following sections: ${missing.join(", ")}`]
          : undefined,
      };
    });
  },
};
```

- [ ] **Step 2: Run tests, commit**

Run: `cd server && npx vitest run src/__tests__/registry-checks.test.ts`
Expected: PASS

```
git add registry/checks/required-sections/ server/src/__tests__/registry-checks.test.ts
git commit -m "feat: add required-sections check"
```

---

### Task 10: `image-text-ratio` check (SVG only)

**Files:**
- Create: `registry/checks/image-text-ratio/manifest.json`
- Create: `registry/checks/image-text-ratio/check.ts`
- Modify: `server/src/__tests__/registry-checks.test.ts`

- [ ] **Step 1: Write tests, implement, verify**

Tests to append:

```typescript
describe("image-text-ratio", () => {
  let mod: { execute: (ctx: CheckContext) => Promise<any[]> };
  beforeAll(async () => {
    mod = (await import("../../../registry/checks/image-text-ratio/check.ts")).default;
  });

  it("passes SVG with small text area", async () => {
    const svg = '<svg viewBox="0 0 1000 1000"><text x="10" y="50" font-size="20">Hello</text></svg>';
    const results = await mod.execute(makeCtx({ files: [svgFile("ad.svg", svg)] }));
    expect(results[0].passed).toBe(true);
  });

  it("fails SVG with large text area", async () => {
    // Multiple large text elements covering >20%
    const texts = Array.from({ length: 10 }, (_, i) =>
      `<text x="0" y="${i * 100}" font-size="80">${"A".repeat(50)}</text>`
    ).join("");
    const svg = `<svg viewBox="0 0 1000 1000">${texts}</svg>`;
    const results = await mod.execute(makeCtx({ files: [svgFile("ad.svg", svg)] }));
    expect(results[0].passed).toBe(false);
  });

  it("skips non-SVG images", async () => {
    const results = await mod.execute(makeCtx({
      files: [{ filename: "photo.png", content: Buffer.from([]), contentType: "image/png", sizeBytes: 0 }],
    }));
    expect(results[0].passed).toBe(true);
    expect(results[0].details).toContain("SVG only");
  });
});
```

Create `registry/checks/image-text-ratio/manifest.json`:

```json
{
  "name": "image-text-ratio",
  "type": "check",
  "version": "1.0.0",
  "description": "Estimates the percentage of an SVG image occupied by text elements",
  "supportedTypes": ["image/svg+xml"],
  "configSchema": {
    "max_text_percent": {
      "type": "number",
      "default": 20,
      "description": "Maximum allowed text area percentage (Meta guideline: 20%)"
    }
  },
  "dependencies": { "binaries": [], "env": [], "npm": [] },
  "entrypoint": "check.ts"
}
```

Create `registry/checks/image-text-ratio/check.ts`:

```typescript
import type { CheckContext, CheckResult } from "@aros/types";

function estimateTextArea(svg: string): { textPercent: number; viewBoxArea: number } | null {
  const vbMatch = svg.match(/viewBox=["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/);
  if (!vbMatch) return null;

  const vbWidth = parseFloat(vbMatch[1]);
  const vbHeight = parseFloat(vbMatch[2]);
  const viewBoxArea = vbWidth * vbHeight;
  if (viewBoxArea === 0) return null;

  let textArea = 0;
  // Estimate each <text> element's bounding box from font-size and content length
  const textElements = svg.matchAll(/<text[^>]*font-size=["']?([\d.]+)["']?[^>]*>([\s\S]*?)<\/text>/gi);
  for (const match of textElements) {
    const fontSize = parseFloat(match[1]) || 16;
    const content = match[2].replace(/<[^>]*>/g, "").trim();
    const charWidth = fontSize * 0.6; // approximate character width
    const lineHeight = fontSize * 1.2;
    textArea += content.length * charWidth * lineHeight;
  }

  // Also catch <text> without font-size (default ~16)
  const plainTexts = svg.matchAll(/<text(?![^>]*font-size)[^>]*>([\s\S]*?)<\/text>/gi);
  for (const match of plainTexts) {
    const content = match[1].replace(/<[^>]*>/g, "").trim();
    textArea += content.length * 9.6 * 19.2; // 16 * 0.6 * 16 * 1.2
  }

  return { textPercent: (textArea / viewBoxArea) * 100, viewBoxArea };
}

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const maxPercent = (ctx.config.max_text_percent as number) ?? 20;

    return ctx.files.map((file) => {
      if (file.contentType !== "image/svg+xml") {
        return {
          name: "image-text-ratio",
          file: file.filename,
          passed: true,
          details: "SVG only — skipped for this file type. Raster text detection is a future enhancement.",
        };
      }

      const text = typeof file.content === "string" ? file.content : file.content.toString("utf-8");
      const result = estimateTextArea(text);

      if (!result) {
        return {
          name: "image-text-ratio",
          file: file.filename,
          passed: true,
          details: "Could not parse SVG viewBox — skipped.",
        };
      }

      const percent = Math.round(result.textPercent * 10) / 10;
      return {
        name: "image-text-ratio",
        file: file.filename,
        passed: percent <= maxPercent,
        details: `Estimated text area: ${percent}% (max ${maxPercent}%)`,
        suggestions: percent > maxPercent
          ? [`Reduce text overlay — Meta recommends <${maxPercent}% text on ad images.`]
          : undefined,
      };
    });
  },
};
```

- [ ] **Step 2: Run tests, commit**

Run: `cd server && npx vitest run src/__tests__/registry-checks.test.ts`
Expected: PASS

```
git add registry/checks/image-text-ratio/ server/src/__tests__/registry-checks.test.ts
git commit -m "feat: add image-text-ratio check (SVG only)"
```

---

### Task 11: `marketplace-fields` check

**Files:**
- Create: `registry/checks/marketplace-fields/manifest.json`
- Create: `registry/checks/marketplace-fields/check.ts`
- Modify: `server/src/__tests__/registry-checks.test.ts`

- [ ] **Step 1: Write tests, implement, verify**

Tests to append:

```typescript
describe("marketplace-fields", () => {
  let mod: { execute: (ctx: CheckContext) => Promise<any[]> };
  beforeAll(async () => {
    mod = (await import("../../../registry/checks/marketplace-fields/check.ts")).default;
  });

  it("passes when all required fields present in JSON", async () => {
    const content = JSON.stringify({ title: "Widget", description: "Great widget", tags: ["sale"] });
    const results = await mod.execute(makeCtx({
      files: [textFile("listing.json", content)],
      config: { required_fields: ["title", "description", "tags"] },
    }));
    expect(results[0].passed).toBe(true);
  });

  it("fails when required fields missing from JSON", async () => {
    const content = JSON.stringify({ title: "Widget" });
    const results = await mod.execute(makeCtx({
      files: [textFile("listing.json", content)],
      config: { required_fields: ["title", "description", "tags"] },
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("description");
    expect(results[0].details).toContain("tags");
  });

  it("validates field length limits", async () => {
    const content = JSON.stringify({ title: "A".repeat(100), description: "Short" });
    const results = await mod.execute(makeCtx({
      files: [textFile("listing.json", content)],
      config: {
        required_fields: ["title", "description"],
        field_limits: { title: { max: 70 } },
      },
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("title");
    expect(results[0].details).toContain("100");
  });

  it("extracts fields from markdown H2 headings", async () => {
    const content = "## Title\n\nMy Product\n\n## Description\n\nGreat product\n\n## Features\n\n- Fast";
    const results = await mod.execute(makeCtx({
      files: [textFile("listing.md", content)],
      config: { required_fields: ["title", "description", "features"] },
    }));
    expect(results[0].passed).toBe(true);
  });

  it("passes non-text files as skip", async () => {
    const results = await mod.execute(makeCtx({
      files: [{ filename: "photo.png", content: Buffer.from([]), contentType: "image/png", sizeBytes: 0 }],
      config: { required_fields: ["title"] },
    }));
    expect(results[0].passed).toBe(true);
  });
});
```

Create `registry/checks/marketplace-fields/manifest.json`:

```json
{
  "name": "marketplace-fields",
  "type": "check",
  "version": "1.0.0",
  "description": "Validates that required marketplace listing fields are populated and within platform limits",
  "supportedTypes": ["text/*"],
  "configSchema": {
    "platform": { "type": "string", "default": "shopify" },
    "required_fields": {
      "type": "array",
      "items": { "type": "string" },
      "default": ["title", "description"]
    },
    "field_limits": {
      "type": "object",
      "default": {},
      "description": "Per-field character limits: { fieldName: { min?: number, max?: number } }"
    }
  },
  "dependencies": { "binaries": [], "env": [], "npm": [] },
  "entrypoint": "check.ts"
}
```

Create `registry/checks/marketplace-fields/check.ts`:

```typescript
import type { CheckContext, CheckResult } from "@aros/types";

interface FieldLimit { min?: number; max?: number; }

function extractFields(text: string): Record<string, string> {
  // Try JSON first
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) {
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        fields[key] = Array.isArray(value) ? value.join("\n") : String(value);
      }
      return fields;
    }
  } catch { /* not JSON, try markdown */ }

  // Markdown: extract H2 sections
  const fields: Record<string, string> = {};
  const sections = text.split(/^##\s+/m).slice(1);
  for (const section of sections) {
    const lines = section.split("\n");
    const heading = lines[0]?.trim().toLowerCase() ?? "";
    const body = lines.slice(1).join("\n").trim();
    if (heading) fields[heading] = body;
  }
  return fields;
}

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const requiredFields = (ctx.config.required_fields as string[]) ?? ["title", "description"];
    const fieldLimits = (ctx.config.field_limits as Record<string, FieldLimit>) ?? {};

    return ctx.files.map((file) => {
      if (typeof file.content !== "string") {
        return { name: "marketplace-fields", file: file.filename, passed: true, details: "Skipped — binary content." };
      }

      const fields = extractFields(file.content);
      const issues: string[] = [];

      // Check required fields
      const missing = requiredFields.filter((f) => {
        const key = Object.keys(fields).find((k) => k.toLowerCase() === f.toLowerCase());
        return !key || !fields[key]?.trim();
      });
      if (missing.length > 0) {
        issues.push(`Missing fields: ${missing.join(", ")}`);
      }

      // Check field limits
      for (const [fieldName, limits] of Object.entries(fieldLimits)) {
        const key = Object.keys(fields).find((k) => k.toLowerCase() === fieldName.toLowerCase());
        if (!key || !fields[key]) continue;
        const len = fields[key].length;
        if (limits.min && len < limits.min) {
          issues.push(`${fieldName}: ${len} chars (min ${limits.min})`);
        }
        if (limits.max && len > limits.max) {
          issues.push(`${fieldName}: ${len} chars (max ${limits.max})`);
        }
      }

      return {
        name: "marketplace-fields",
        file: file.filename,
        passed: issues.length === 0,
        details: issues.length === 0
          ? `All ${requiredFields.length} required fields present and within limits.`
          : issues.join("; "),
        suggestions: issues.length > 0
          ? ["Ensure all required marketplace fields are populated and within character limits."]
          : undefined,
      };
    });
  },
};
```

- [ ] **Step 2: Run tests, commit**

Run: `cd server && npx vitest run src/__tests__/registry-checks.test.ts`
Expected: PASS

```
git add registry/checks/marketplace-fields/ server/src/__tests__/registry-checks.test.ts
git commit -m "feat: add marketplace-fields check"
```

---

## Chunk 3: Criteria Manifests

All criteria follow the same manifest structure. The `promptGuidance` text for each criterion is defined in the spec at `docs/superpowers/specs/2026-03-13-registry-policies-design.md`. The implementing agent MUST read the spec to copy the exact `promptGuidance` string for each criterion.

### Task 12: Create 14 new criterion manifests

**Template:**
Every criterion manifest is `registry/criteria/{name}/manifest.json` with this structure:

```json
{
  "name": "<name>",
  "type": "criterion",
  "version": "1.0.0",
  "description": "<description>",
  "applicableTo": ["<mime-patterns>"],
  "defaultWeight": <number>,
  "scale": 10,
  "promptGuidance": "<copy from spec>"
}
```

**Criteria to create (one manifest.json per directory):**

| # | Name | Directory | Description | applicableTo | defaultWeight |
|---|---|---|---|---|---|
| 1 | `conversion-potential` | `registry/criteria/conversion-potential/` | Likelihood of driving the desired user action | `["text/*", "image/*"]` | 3 |
| 2 | `value-proposition-clarity` | `registry/criteria/value-proposition-clarity/` | How clearly the core value prop comes through | `["text/*", "image/*"]` | 3 |
| 3 | `customer-empathy` | `registry/criteria/customer-empathy/` | Understanding of the customer's pain, context, and language | `["text/*"]` | 2 |
| 4 | `urgency-authenticity` | `registry/criteria/urgency-authenticity/` | Use of urgency/scarcity without manipulation or dishonesty | `["text/*", "image/*"]` | 1 |
| 5 | `seo-effectiveness` | `registry/criteria/seo-effectiveness/` | Keyword integration, search intent alignment, snippet-readiness | `["text/*"]` | 2 |
| 6 | `information-architecture` | `registry/criteria/information-architecture/` | Content structure, scannability, logical flow | `["text/*"]` | 2 |
| 7 | `email-craft` | `registry/criteria/email-craft/` | Subject line hook, scannable structure, mobile-readiness | `["text/*"]` | 3 |
| 8 | `marketplace-optimization` | `registry/criteria/marketplace-optimization/` | Search ranking signals, comparison-shopping psychology | `["text/*"]` | 3 |
| 9 | `technical-accuracy` | `registry/criteria/technical-accuracy/` | Factual correctness of product/feature claims | `["text/*"]` | 2 |
| 10 | `response-resolution` | `registry/criteria/response-resolution/` | Whether a support reply actually resolves the customer's issue | `["text/*"]` | 3 |
| 11 | `emotional-intelligence` | `registry/criteria/emotional-intelligence/` | Empathy calibration, tone-matching to customer's emotional state | `["text/*"]` | 2 |
| 12 | `accessibility-inclusivity` | `registry/criteria/accessibility-inclusivity/` | Reading level, alt text, inclusive language, cognitive load | `["text/*", "image/*"]` | 2 |
| 13 | `visual-hierarchy` | `registry/criteria/visual-hierarchy/` | Composition, focal point, typographic hierarchy, whitespace | `["image/*"]` | 3 |
| 14 | `platform-native-craft` | `registry/criteria/platform-native-craft/` | Whether content feels native vs. repurposed for the platform | `["image/*", "text/*"]` | 2 |

**Steps for each criterion:**

- [ ] **Step 1: Create all 14 directories and manifest files**

For each row in the table above:
1. Create directory: `registry/criteria/{name}/`
2. Create `manifest.json` using the template with values from the table
3. Copy `promptGuidance` from the spec — it's under the criterion's heading in the "New Criteria" or "Enhanced Existing Criteria" section

- [ ] **Step 2: Verify all manifests parse correctly**

Quick validation — create a one-off test or use Node to parse each:

Run: `cd server && node -e "const fs=require('fs'),path=require('path'),z=require('zod'); const dir='../registry/criteria'; for(const d of fs.readdirSync(dir)){const p=path.join(dir,d,'manifest.json'); if(!fs.existsSync(p))continue; const m=JSON.parse(fs.readFileSync(p,'utf-8')); if(m.type!=='criterion')continue; if(!m.promptGuidance||m.promptGuidance.length<50)console.log('SHORT GUIDANCE:',d); else console.log('OK:',d,m.promptGuidance.length,'chars');}" `

Expected: All 14 new criteria show "OK" with >100 chars of guidance

- [ ] **Step 3: Commit**

```
git add registry/criteria/conversion-potential/ registry/criteria/value-proposition-clarity/ registry/criteria/customer-empathy/ registry/criteria/urgency-authenticity/ registry/criteria/seo-effectiveness/ registry/criteria/information-architecture/ registry/criteria/email-craft/ registry/criteria/marketplace-optimization/ registry/criteria/technical-accuracy/ registry/criteria/response-resolution/ registry/criteria/emotional-intelligence/ registry/criteria/accessibility-inclusivity/ registry/criteria/visual-hierarchy/ registry/criteria/platform-native-craft/
git commit -m "feat: add 14 new criterion manifests with expert scoring guidance"
```

---

### Task 13: Enhance 8 existing criterion manifests

**Files to modify** (update `promptGuidance` field in each):

| # | Name | File | Action |
|---|---|---|---|
| 1 | `brand-consistency` | `registry/criteria/brand-consistency/manifest.json` | Replace `promptGuidance` |
| 2 | `visual-impact` | `registry/criteria/visual-impact/manifest.json` | Replace `promptGuidance` |
| 3 | `tone-alignment` | `registry/criteria/tone-alignment/manifest.json` | Replace `promptGuidance` |
| 4 | `readability` | `registry/criteria/readability/manifest.json` | Replace `promptGuidance` |
| 5 | `originality` | `registry/criteria/originality/manifest.json` | Replace `promptGuidance` |
| 6 | `call-to-action` | `registry/criteria/call-to-action/manifest.json` | Replace `promptGuidance` |
| 7 | `ad-compliance` | `registry/criteria/ad-compliance/manifest.json` | Replace `promptGuidance` |
| 8 | `platform-fit` | `registry/criteria/platform-fit/manifest.json` | Replace `promptGuidance` |

- [ ] **Step 1: Update each manifest**

For each file above:
1. Read the existing manifest.json
2. Replace the `promptGuidance` value with the enhanced version from the spec (look under "Enhanced Existing Criteria" section)
3. Keep all other fields unchanged

- [ ] **Step 2: Verify all manifests still parse**

Run same validation from Task 12 Step 2.
Expected: All 22 criteria (8 existing + 14 new) show "OK"

- [ ] **Step 3: Commit**

```
git add registry/criteria/brand-consistency/ registry/criteria/visual-impact/ registry/criteria/tone-alignment/ registry/criteria/readability/ registry/criteria/originality/ registry/criteria/call-to-action/ registry/criteria/ad-compliance/ registry/criteria/platform-fit/
git commit -m "feat: enhance 8 existing criteria with expert-level scoring guidance"
```

---

## Chunk 4: Policy Manifests

### Task 14: Create 9 new policy manifests

Each policy is a `manifest.json` in `registry/policies/{name}/`. The policy compositions (checks, configs, severity, criteria, weights, thresholds) are defined in the spec under "Policy Compositions."

**Template:**

```json
{
  "name": "<name>",
  "type": "policy",
  "version": "1.0.0",
  "description": "<description>",
  "usage_hint": "<from spec Policy Selection Hints table>",
  "requires": {
    "checks": ["<check-names-used>"],
    "criteria": ["<criteria-names-used>"]
  },
  "policy": {
    "name": "<name>",
    "stages": ["objective", "subjective", "human"],
    "max_revisions": <number>,
    "objective": {
      "checks": [
        { "name": "<check>", "config": {<config>}, "severity": "<blocking|warning>" }
      ],
      "fail_threshold": 1
    },
    "subjective": {
      "criteria": [
        { "name": "<criterion>", "description": "<short desc>", "weight": <N>, "scale": 10 }
      ],
      "pass_threshold": <number>
    },
    "human": { "required": true }
  }
}
```

**Policies to create:**

| # | Policy | Directory | Max Rev | Pass Threshold |
|---|---|---|---|---|
| 1 | `landing-page` | `registry/policies/landing-page/` | 3 | 6.5 |
| 2 | `email-campaign` | `registry/policies/email-campaign/` | 3 | 6.0 |
| 3 | `social-ad` | `registry/policies/social-ad/` | 3 | 6.5 |
| 4 | `social-post` | `registry/policies/social-post/` | 2 | 5.5 |
| 5 | `product-description` | `registry/policies/product-description/` | 3 | 6.5 |
| 6 | `feature-announcement` | `registry/policies/feature-announcement/` | 2 | 6.5 |
| 7 | `help-article` | `registry/policies/help-article/` | 3 | 7.0 |
| 8 | `onboarding-sequence` | `registry/policies/onboarding-sequence/` | 3 | 6.5 |
| 9 | `support-response` | `registry/policies/support-response/` | 2 | 7.0 |
| 10 | `social-graphic` | `registry/policies/social-graphic/` | 2 | 6.5 |
| 11 | `content-article` | `registry/policies/content-article/` | 3 | 6.0 |

For each policy, the implementing agent must:
1. Read the spec to get the exact objective checks (with configs and severity) and subjective criteria (with weights)
2. Read the spec's Policy Selection Hints table for the `usage_hint` value
3. Populate the `requires.checks` and `requires.criteria` arrays from the objective/subjective tables
4. Set `fail_threshold: 1` for all policies (any blocking failure = fail)

**Steps:**

- [ ] **Step 1: Create all 11 policy manifests**

For each row in the table, create the directory and manifest.json using the template, populated with values from the spec's policy composition tables.

- [ ] **Step 2: Verify all policy manifests parse**

Run: `cd server && node -e "const fs=require('fs'),path=require('path'); const dir='../registry/policies'; for(const d of fs.readdirSync(dir)){const p=path.join(dir,d,'manifest.json'); if(!fs.existsSync(p))continue; const m=JSON.parse(fs.readFileSync(p,'utf-8')); console.log(d,': checks='+m.requires?.checks?.length, 'criteria='+m.requires?.criteria?.length, 'stages='+m.policy?.stages?.length, 'hint='+(m.usage_hint?'yes':'NO'));}" `

Expected: All 11 new policies show check/criteria counts matching the spec's Summary Matrix, and `hint=yes` for all.

- [ ] **Step 3: Commit**

```
git add registry/policies/landing-page/ registry/policies/email-campaign/ registry/policies/social-ad/ registry/policies/social-post/ registry/policies/product-description/ registry/policies/feature-announcement/ registry/policies/help-article/ registry/policies/onboarding-sequence/ registry/policies/support-response/ registry/policies/social-graphic/ registry/policies/content-article/
git commit -m "feat: add 11 new policy manifests for ecommerce/SaaS startup suite"
```

---

### Task 15: Enhance `brand-asset` policy and retire old policies

**Files:**
- Modify: `registry/policies/brand-asset/manifest.json`
- Delete: `registry/policies/blog-post/` (replaced by `content-article`)
- Delete: `registry/policies/instagram-ad/` (replaced by `social-ad`)

- [ ] **Step 1: Update brand-asset policy manifest**

Read the existing `registry/policies/brand-asset/manifest.json`. Update it to match the spec:
- Add `usage_hint`
- Add `image-dimensions` and `aspect-ratio` to objective checks (as warnings)
- Add `visual-hierarchy` and `accessibility-inclusivity` to subjective criteria
- Update the `requires` block to include the new dependencies
- Keep `pass_threshold: 7.0` and `max_revisions: 2` (unchanged)

Updated manifest:

```json
{
  "name": "brand-asset",
  "type": "policy",
  "version": "2.0.0",
  "description": "Review policy for brand assets (logos, banners, icons, design system elements). Validates format and dimensions, then AI review for brand consistency and visual quality before human approval.",
  "usage_hint": "Use for core brand materials — logos, icons, banners, design system elements, brand collateral. These are foundational assets that other content is built on. Not for social graphics or ad creatives.",
  "requires": {
    "checks": ["format-check", "file-size", "image-dimensions", "aspect-ratio"],
    "criteria": ["brand-consistency", "visual-hierarchy", "visual-impact", "accessibility-inclusivity"]
  },
  "policy": {
    "name": "brand-asset",
    "stages": ["objective", "subjective", "human"],
    "max_revisions": 2,
    "objective": {
      "checks": [
        { "name": "format-check", "config": { "allowed": ["image/png", "image/svg+xml", "image/jpeg", "application/pdf"] }, "severity": "blocking" },
        { "name": "file-size", "config": { "max_mb": 50 }, "severity": "blocking" },
        { "name": "image-dimensions", "config": { "min_width": 100, "min_height": 100 }, "severity": "warning" },
        { "name": "aspect-ratio", "config": { "allowed_ratios": ["1:1", "16:9", "4:3", "2:1"] }, "severity": "warning" }
      ],
      "fail_threshold": 1
    },
    "subjective": {
      "criteria": [
        { "name": "brand-consistency", "description": "Does it match brand guidelines?", "weight": 3, "scale": 10 },
        { "name": "visual-hierarchy", "description": "Are design fundamentals sound?", "weight": 3, "scale": 10 },
        { "name": "visual-impact", "description": "Is it distinctive and memorable?", "weight": 2, "scale": 10 },
        { "name": "accessibility-inclusivity", "description": "Contrast, legibility, color-blind safety", "weight": 2, "scale": 10 }
      ],
      "pass_threshold": 7.0
    },
    "human": { "required": true }
  }
}
```

- [ ] **Step 2: Remove retired policies**

Delete `registry/policies/blog-post/` directory (replaced by `content-article`)
Delete `registry/policies/instagram-ad/` directory (replaced by `social-ad`)

- [ ] **Step 3: Commit**

```
git add registry/policies/brand-asset/manifest.json
git rm -r registry/policies/blog-post/ registry/policies/instagram-ad/
git commit -m "feat: enhance brand-asset policy, retire blog-post and instagram-ad"
```

---

### Task 16: Final integration verification

- [ ] **Step 1: Run all tests**

Run: `cd server && npx vitest run`
Expected: All existing tests + new registry-checks tests pass

- [ ] **Step 2: Verify registry listing**

Run: `cd server && node -e "const fs=require('fs'),path=require('path'); const reg='../registry'; const checks=fs.readdirSync(path.join(reg,'checks')).filter(d=>fs.existsSync(path.join(reg,'checks',d,'manifest.json'))); const criteria=fs.readdirSync(path.join(reg,'criteria')).filter(d=>fs.existsSync(path.join(reg,'criteria',d,'manifest.json'))); const policies=fs.readdirSync(path.join(reg,'policies')).filter(d=>fs.existsSync(path.join(reg,'policies',d,'manifest.json'))); console.log('Checks:',checks.length,'(',checks.join(', '),')'); console.log('Criteria:',criteria.length,'(',criteria.join(', '),')'); console.log('Policies:',policies.length,'(',policies.join(', '),')');"`

Expected:
- Checks: 15 (7 existing + 8 new)
- Criteria: 22 (8 existing + 14 new)
- Policies: 12 (brand-asset enhanced + 11 new; blog-post and instagram-ad removed)

- [ ] **Step 3: Build server to verify TypeScript compiles**

Run: `cd server && npm run build`
Expected: No errors

- [ ] **Step 4: Commit any remaining fixes, then tag completion**

```
git commit -m "chore: registry policies implementation complete" --allow-empty
```
