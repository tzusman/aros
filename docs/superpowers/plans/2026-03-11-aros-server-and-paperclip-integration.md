# AROS Server & Paperclip Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AROS backend (Express server, MCP server, CLI) so AI agents can submit deliverables for multi-stage review via a real-time dashboard.

**Architecture:** pnpm monorepo with 5 packages: `packages/types` (shared interfaces), `server` (Express REST + SSE + pipeline engine), `mcp` (STDIO MCP server with 10 tools), `cli` (Commander.js entry point), and the existing `dashboard` (Vite + React). All state lives on the filesystem — no database. The MCP and HTTP server share state via the filesystem.

**Tech Stack:** TypeScript, Express.js, @modelcontextprotocol/sdk, Zod 3.x, chokidar, @anthropic-ai/sdk, Commander.js, @clack/prompts, esbuild, pnpm workspaces

**Spec:** `docs/superpowers/specs/2026-03-11-aros-server-and-paperclip-integration-design.md`

---

## Chunk 1: Foundation — Monorepo + Shared Types + Storage Layer

### Task 1: Monorepo Scaffolding

Set up the pnpm workspace with all package directories and shared config.

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/types/src/index.ts`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `mcp/package.json`
- Create: `mcp/tsconfig.json`
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`

- [ ] **Step 1: Create root workspace config**

`pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
  - server
  - mcp
  - cli
  - dashboard
```

`package.json`:
```json
{
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm -r --parallel dev",
    "clean": "pnpm -r clean"
  },
  "engines": {
    "node": ">=20"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

- [ ] **Step 2: Create packages/types**

`packages/types/package.json`:
```json
{
  "name": "@aros/types",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.9.3"
  }
}
```

`packages/types/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write shared types in packages/types/src/index.ts**

All types from spec Section 12: `Stage`, `FolderStrategy`, `DeliverableMeta`, `DeliverableStatus`, `DeliverableFile`, `Feedback`, `FeedbackIssue`, `NotificationConfig`, `ObjectiveCheck`, `SubjectiveCriterion`, `PolicyObjectiveCheck`, `PolicySubjectiveCriterion`, `PolicyConfig`, `Decision`, `DecisionPayload`, `DeliverableSummary`, `Deliverable`, `PipelineCounts`, `SSEEventType`, `ConnectionStatus`.

```typescript
// ---- Enums & Unions ----

export type Stage =
  | "draft"
  | "objective"
  | "subjective"
  | "human"
  | "approved"
  | "rejected"
  | "revision_requested";

export type FolderStrategy = "all_pass" | "select" | "rank" | "categorize";
export type Decision = "approved" | "revision_requested" | "rejected";

// ---- Objective / Subjective Results ----

export interface ObjectiveCheck {
  name: string;
  passed: boolean;
  severity: "blocking" | "warning";
  details: string;
}

export interface SubjectiveCriterion {
  name: string;
  score: number;
  weight: number;
  scale: number;
  rationale: string;
}

// ---- Feedback ----

export interface FeedbackIssue {
  file: string | null;
  location: string;
  category: string;
  severity: "critical" | "major" | "minor";
  description: string;
  suggestion: string;
}

export interface Feedback {
  stage: string;
  decision: "revision_requested" | "rejected";
  summary: string;
  issues: FeedbackIssue[];
  reviewer: string;
  timestamp: string;
}

// ---- Deliverable ----

export interface DeliverableMeta {
  title: string;
  brief: string;
  policy: string;
  source_agent: string;
  content_type: string;
  folder_strategy?: FolderStrategy;
  notification?: NotificationConfig;
}

export interface DeliverableStatus {
  stage: Stage;
  score: number | null;
  revision_number: number;
  entered_stage_at: string;
  submitted_at: string;
  rejecting_stage: Stage | null;
}

export interface DeliverableFile {
  filename: string;
  content_type: string;
  size_bytes: number;
  preview_url?: string;
  objective_results: ObjectiveCheck[] | null;
  subjective_results: SubjectiveCriterion[] | null;
  score: number | null;
  status: "passed" | "failed" | "revision_requested" | null;
}

export interface RevisionEntry {
  version: number;
  summary: string;
  feedback: Feedback | null;
  timestamp: string;
}

export interface DeliverableSummary {
  id: string;
  title: string;
  source_agent: string;
  policy: string;
  content_type: string;
  stage: Stage;
  score: number | null;
  entered_stage_at: string;
  submitted_at: string;
  revision_number: number;
  is_folder: boolean;
  file_count: number | null;
}

export interface Deliverable extends DeliverableSummary {
  content: string;
  brief: string;
  objective_results: ObjectiveCheck[] | null;
  subjective_results: SubjectiveCriterion[] | null;
  feedback: Feedback | null;
  history: RevisionEntry[];
  files: DeliverableFile[] | null;
  folder_strategy: FolderStrategy | null;
}

export interface DecisionPayload {
  decision: Decision;
  reason?: string;
}

// ---- Notification ----

export interface NotificationConfig {
  driver: string;
  target: Record<string, unknown>;
  events: string[];
}

// ---- Policy ----

export interface PolicyObjectiveCheck {
  name: string;
  config: Record<string, unknown>;
  severity: "blocking" | "warning";
}

export interface PolicySubjectiveCriterion {
  name: string;
  description: string;
  weight: number;
  scale: number;
}

export interface PolicyConfig {
  name: string;
  stages: Stage[];
  max_revisions: number;
  objective?: {
    checks: PolicyObjectiveCheck[];
    fail_threshold: number;
  };
  subjective?: {
    criteria: PolicySubjectiveCriterion[];
    pass_threshold: number;
  };
  human?: { required: boolean };
}

// ---- Pipeline ----

export interface PipelineCounts {
  in_progress: number;
  pending_human: number;
  awaiting_revisions: number;
  approved_72h: number;
  rejected_72h: number;
}

// ---- SSE ----

export type SSEEventType =
  | "deliverable:submitted"
  | "deliverable:stage_changed"
  | "deliverable:decided"
  | "deliverable:revised";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";
```

- [ ] **Step 4: Create server, mcp, cli package shells**

`server/package.json`:
```json
{
  "name": "@aros/server",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./storage.js": { "types": "./dist/storage.d.ts", "default": "./dist/storage.js" },
    "./pipeline/engine.js": { "types": "./dist/pipeline/engine.d.ts", "default": "./dist/pipeline/engine.js" },
    "./pipeline/objective.js": { "types": "./dist/pipeline/objective.d.ts", "default": "./dist/pipeline/objective.js" },
    "./notifications/driver.js": { "types": "./dist/notifications/driver.d.ts", "default": "./dist/notifications/driver.js" },
    "./notifications/paperclip.js": { "types": "./dist/notifications/paperclip.d.ts", "default": "./dist/notifications/paperclip.js" }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@aros/types": "workspace:*",
    "express": "^5.1.0",
    "chokidar": "^4.0.0",
    "mime-types": "^2.1.35",
    "@anthropic-ai/sdk": "^0.52.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/mime-types": "^2.1.4",
    "@types/node": "^22.0.0",
    "typescript": "^5.9.3"
  }
}
```

`server/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "references": [{ "path": "../packages/types" }]
}
```

`mcp/package.json`:
```json
{
  "name": "@aros/mcp",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@aros/types": "workspace:*",
    "@aros/server": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.9.3"
  }
}
```

`mcp/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "references": [{ "path": "../packages/types" }]
}
```

`cli/package.json`:
```json
{
  "name": "aros",
  "version": "0.1.0",
  "bin": { "aros": "./dist/index.js" },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@aros/server": "workspace:*",
    "@aros/mcp": "workspace:*",
    "commander": "^13.0.0",
    "@clack/prompts": "^0.10.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.9.3"
  }
}
```

`cli/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "references": [{ "path": "../server" }, { "path": "../packages/types" }]
}
```

- [ ] **Step 5: Install dependencies and verify build**

```bash
pnpm install
pnpm -r build
```

Expected: All packages compile. `packages/types/dist/index.js` and `packages/types/dist/index.d.ts` exist.

- [ ] **Step 6: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json packages/ server/package.json server/tsconfig.json mcp/package.json mcp/tsconfig.json cli/package.json cli/tsconfig.json
git commit -m "feat: scaffold pnpm monorepo with shared types package"
```

---

### Task 2: Filesystem Storage Layer

Abstraction for all filesystem operations. Used by both the server and MCP packages.

**Files:**
- Create: `server/src/storage.ts`
- Create: `server/src/__tests__/storage.test.ts`

- [ ] **Step 1: Write storage test**

`server/src/__tests__/storage.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Storage } from "../storage.js";

let tmpDir: string;
let storage: Storage;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-test-"));
  storage = new Storage(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Storage", () => {
  describe("init", () => {
    it("creates project directories and default policy", () => {
      storage.init();
      expect(fs.existsSync(path.join(tmpDir, "review"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "approved"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "rejected"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "policies", "default.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".aros.json"))).toBe(true);
    });
  });

  describe("nextReviewId", () => {
    it("generates sequential IDs for the current date", () => {
      storage.init();
      const id1 = storage.nextReviewId();
      const id2 = storage.nextReviewId();
      expect(id1).toMatch(/^d-\d{8}-001$/);
      expect(id2).toMatch(/^d-\d{8}-002$/);
    });
  });

  describe("createReview", () => {
    it("writes meta.json and status.json", () => {
      storage.init();
      const id = storage.createReview({
        title: "Test",
        brief: "Brief",
        policy: "default",
        source_agent: "test-agent",
        content_type: "text/plain",
      });
      const meta = storage.readMeta(id);
      expect(meta.title).toBe("Test");
      const status = storage.readStatus(id);
      expect(status.stage).toBe("draft");
    });
  });

  describe("addFile", () => {
    it("writes a text file to content/", () => {
      storage.init();
      const id = storage.createReview({
        title: "Test", brief: "B", policy: "default",
        source_agent: "a", content_type: "text/plain",
      });
      storage.addFile(id, "readme.md", "# Hello", "text/markdown", "utf-8");
      const content = fs.readFileSync(
        path.join(tmpDir, "review", id, "content", "readme.md"), "utf-8"
      );
      expect(content).toBe("# Hello");
    });

    it("writes a base64 binary file", () => {
      storage.init();
      const id = storage.createReview({
        title: "Test", brief: "B", policy: "default",
        source_agent: "a", content_type: "image/png",
      });
      const b64 = Buffer.from("fakepng").toString("base64");
      storage.addFile(id, "img.png", b64, "image/png", "base64");
      const buf = fs.readFileSync(path.join(tmpDir, "review", id, "content", "img.png"));
      expect(buf.toString()).toBe("fakepng");
    });
  });

  describe("listFiles", () => {
    it("returns file metadata", () => {
      storage.init();
      const id = storage.createReview({
        title: "T", brief: "B", policy: "default",
        source_agent: "a", content_type: "text/plain",
      });
      storage.addFile(id, "a.txt", "hi", "text/plain", "utf-8");
      storage.addFile(id, "b.txt", "there", "text/plain", "utf-8");
      const files = storage.listFiles(id);
      expect(files).toHaveLength(2);
      expect(files[0].filename).toBe("a.txt");
    });
  });

  describe("updateStatus", () => {
    it("writes stage and validates transition", () => {
      storage.init();
      const id = storage.createReview({
        title: "T", brief: "B", policy: "default",
        source_agent: "a", content_type: "text/plain",
      });
      storage.updateStatus(id, { stage: "objective", entered_stage_at: new Date().toISOString() });
      expect(storage.readStatus(id).stage).toBe("objective");
    });
  });

  describe("saveHistory", () => {
    it("copies current files to history/v{N}", () => {
      storage.init();
      const id = storage.createReview({
        title: "T", brief: "B", policy: "default",
        source_agent: "a", content_type: "text/plain",
      });
      storage.addFile(id, "draft.md", "v1 content", "text/markdown", "utf-8");
      storage.saveHistory(id, 1);
      expect(fs.existsSync(path.join(tmpDir, "review", id, "history", "v1", "draft.md"))).toBe(true);
    });
  });

  describe("moveToTerminal", () => {
    it("copies approved deliverable to approved/", () => {
      storage.init();
      const id = storage.createReview({
        title: "T", brief: "B", policy: "default",
        source_agent: "a", content_type: "text/plain",
      });
      storage.addFile(id, "doc.md", "content", "text/markdown", "utf-8");
      storage.moveToTerminal(id, "approved");
      expect(fs.existsSync(path.join(tmpDir, "approved", id, "content", "doc.md"))).toBe(true);
    });
  });

  describe("listReviews", () => {
    it("lists all reviews with summary data", () => {
      storage.init();
      storage.createReview({
        title: "A", brief: "B", policy: "default",
        source_agent: "agent-1", content_type: "text/plain",
      });
      storage.createReview({
        title: "B", brief: "B", policy: "default",
        source_agent: "agent-2", content_type: "text/plain",
      });
      const all = storage.listReviews();
      expect(all).toHaveLength(2);
    });

    it("filters by stage", () => {
      storage.init();
      const id = storage.createReview({
        title: "A", brief: "B", policy: "default",
        source_agent: "agent-1", content_type: "text/plain",
      });
      // draft by default
      const drafts = storage.listReviews({ stage: "draft" });
      expect(drafts).toHaveLength(1);
      const humans = storage.listReviews({ stage: "human" });
      expect(humans).toHaveLength(0);
    });
  });

  describe("policies", () => {
    it("lists policies from policies/ dir", () => {
      storage.init();
      const policies = storage.listPolicies();
      expect(policies.length).toBeGreaterThanOrEqual(1);
      expect(policies[0].name).toBe("default");
    });

    it("reads a single policy", () => {
      storage.init();
      const policy = storage.readPolicy("default");
      expect(policy.stages).toContain("objective");
    });
  });

  describe("getConfig", () => {
    it("reads .aros.json", () => {
      storage.init();
      const config = storage.getConfig();
      expect(config.port).toBe(4100);
    });
  });
});
```

- [ ] **Step 2: Add vitest to server package**

Add to `server/package.json` devDependencies:
```json
"vitest": "^3.2.0"
```

Add script: `"test": "vitest run"`, `"test:watch": "vitest"`

Run: `pnpm install`

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @aros/server test
```

Expected: All tests fail — `Storage` class does not exist.

- [ ] **Step 4: Implement Storage class**

`server/src/storage.ts` — Full implementation:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  DeliverableMeta,
  DeliverableStatus,
  DeliverableSummary,
  Deliverable,
  DeliverableFile,
  Feedback,
  PolicyConfig,
  ObjectiveCheck,
  SubjectiveCriterion,
  RevisionEntry,
  Stage,
} from "@aros/types";

interface ArosConfig {
  version: number;
  port: number;
  subjective_model: string;
}

const DEFAULT_POLICY: PolicyConfig = {
  name: "default",
  stages: ["objective", "subjective", "human"],
  max_revisions: 3,
  objective: {
    checks: [
      { name: "file_size", config: { max_mb: 10 }, severity: "blocking" },
      { name: "format_check", config: { allowed: ["image/*", "text/*", "application/pdf"] }, severity: "blocking" },
    ],
    fail_threshold: 1,
  },
  subjective: {
    criteria: [
      { name: "relevance", description: "How well does the deliverable match the brief?", weight: 3, scale: 10 },
      { name: "quality", description: "Overall production quality", weight: 2, scale: 10 },
      { name: "clarity", description: "Is the message clear and effective?", weight: 1, scale: 10 },
    ],
    pass_threshold: 6.0,
  },
  human: { required: true },
};

const DEFAULT_CONFIG: ArosConfig = {
  version: 1,
  port: 4100,
  subjective_model: "claude-sonnet-4-20250514",
};

export class Storage {
  constructor(public readonly projectDir: string) {}

  // ---- Paths ----

  private reviewDir(id: string) { return path.join(this.projectDir, "review", id); }
  private contentDir(id: string) { return path.join(this.reviewDir(id), "content"); }
  private metaPath(id: string) { return path.join(this.reviewDir(id), "meta.json"); }
  private statusPath(id: string) { return path.join(this.reviewDir(id), "status.json"); }
  private feedbackPath(id: string) { return path.join(this.reviewDir(id), "feedback.json"); }
  private objectivePath(id: string) { return path.join(this.reviewDir(id), "objective_results.json"); }
  private subjectivePath(id: string) { return path.join(this.reviewDir(id), "subjective_results.json"); }
  private historyDir(id: string, version: number) { return path.join(this.reviewDir(id), "history", `v${version}`); }

  // ---- Init ----

  init() {
    for (const dir of ["review", "approved", "rejected", "policies"]) {
      fs.mkdirSync(path.join(this.projectDir, dir), { recursive: true });
    }
    const policyPath = path.join(this.projectDir, "policies", "default.json");
    if (!fs.existsSync(policyPath)) {
      fs.writeFileSync(policyPath, JSON.stringify(DEFAULT_POLICY, null, 2));
    }
    const configPath = path.join(this.projectDir, ".aros.json");
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    }
  }

  isInitialized(): boolean {
    return fs.existsSync(path.join(this.projectDir, ".aros.json"));
  }

  getConfig(): ArosConfig {
    return JSON.parse(fs.readFileSync(path.join(this.projectDir, ".aros.json"), "utf-8"));
  }

  // ---- Review IDs ----

  nextReviewId(): string {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `d-${today}-`;
    const reviewRoot = path.join(this.projectDir, "review");
    let maxNum = 0;
    if (fs.existsSync(reviewRoot)) {
      for (const entry of fs.readdirSync(reviewRoot)) {
        if (entry.startsWith(prefix)) {
          const num = parseInt(entry.slice(prefix.length), 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
    const next = String(maxNum + 1).padStart(3, "0");
    // Create the directory to "reserve" this ID
    fs.mkdirSync(path.join(reviewRoot, `${prefix}${next}`), { recursive: true });
    return `${prefix}${next}`;
  }

  // ---- Create / Read Review ----

  createReview(meta: DeliverableMeta): string {
    const id = this.nextReviewId();
    const dir = this.reviewDir(id);
    fs.mkdirSync(path.join(dir, "content"), { recursive: true });
    fs.writeFileSync(this.metaPath(id), JSON.stringify(meta, null, 2));
    const status: DeliverableStatus = {
      stage: "draft",
      score: null,
      revision_number: 0,
      entered_stage_at: new Date().toISOString(),
      submitted_at: new Date().toISOString(),
      rejecting_stage: null,
    };
    fs.writeFileSync(this.statusPath(id), JSON.stringify(status, null, 2));
    return id;
  }

  readMeta(id: string): DeliverableMeta {
    return JSON.parse(fs.readFileSync(this.metaPath(id), "utf-8"));
  }

  readStatus(id: string): DeliverableStatus {
    return JSON.parse(fs.readFileSync(this.statusPath(id), "utf-8"));
  }

  updateStatus(id: string, updates: Partial<DeliverableStatus>) {
    const current = this.readStatus(id);
    const merged = { ...current, ...updates };
    fs.writeFileSync(this.statusPath(id), JSON.stringify(merged, null, 2));
  }

  // ---- Files ----

  addFile(id: string, filename: string, content: string, contentType: string, encoding: "utf-8" | "base64") {
    const filePath = path.join(this.contentDir(id), filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (encoding === "base64") {
      fs.writeFileSync(filePath, Buffer.from(content, "base64"));
    } else {
      fs.writeFileSync(filePath, content, "utf-8");
    }
  }

  readFile(id: string, filename: string): { content: string; encoding: "utf-8" | "base64" } {
    const filePath = path.join(this.contentDir(id), filename);
    const buf = fs.readFileSync(filePath);
    // Heuristic: if content type is text, return utf-8
    // For simplicity, try utf-8 and fall back to base64
    try {
      const text = buf.toString("utf-8");
      // Check for binary content by looking for null bytes
      if (text.includes("\0")) {
        return { content: buf.toString("base64"), encoding: "base64" };
      }
      return { content: text, encoding: "utf-8" };
    } catch {
      return { content: buf.toString("base64"), encoding: "base64" };
    }
  }

  getFilePath(id: string, filename: string): string | null {
    // Check review/, approved/, rejected/ in order
    for (const bucket of ["review", "approved", "rejected"]) {
      const p = path.join(this.projectDir, bucket, id, "content", filename);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  listFiles(id: string): DeliverableFile[] {
    const dir = this.contentDir(id);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).map((filename) => {
      const stat = fs.statSync(path.join(dir, filename));
      return {
        filename,
        content_type: guessContentType(filename),
        size_bytes: stat.size,
        preview_url: undefined,
        objective_results: null,
        subjective_results: null,
        score: null,
        status: null,
      };
    });
  }

  // ---- Results ----

  writeObjectiveResults(id: string, results: ObjectiveCheck[]) {
    fs.writeFileSync(this.objectivePath(id), JSON.stringify(results, null, 2));
  }

  readObjectiveResults(id: string): ObjectiveCheck[] | null {
    if (!fs.existsSync(this.objectivePath(id))) return null;
    return JSON.parse(fs.readFileSync(this.objectivePath(id), "utf-8"));
  }

  writeSubjectiveResults(id: string, results: SubjectiveCriterion[] | { skipped: boolean; reason: string }) {
    fs.writeFileSync(this.subjectivePath(id), JSON.stringify(results, null, 2));
  }

  readSubjectiveResults(id: string): SubjectiveCriterion[] | null {
    if (!fs.existsSync(this.subjectivePath(id))) return null;
    const data = JSON.parse(fs.readFileSync(this.subjectivePath(id), "utf-8"));
    if (data.skipped) return null;
    return data;
  }

  writeFeedback(id: string, feedback: Feedback) {
    fs.writeFileSync(this.feedbackPath(id), JSON.stringify(feedback, null, 2));
  }

  readFeedback(id: string): Feedback | null {
    if (!fs.existsSync(this.feedbackPath(id))) return null;
    return JSON.parse(fs.readFileSync(this.feedbackPath(id), "utf-8"));
  }

  // ---- History ----

  /** Save all current content files to history (used before full re-submission). */
  saveHistory(id: string, version: number) {
    const src = this.contentDir(id);
    const dest = this.historyDir(id, version);
    fs.mkdirSync(dest, { recursive: true });
    if (fs.existsSync(src)) {
      for (const file of fs.readdirSync(src)) {
        fs.copyFileSync(path.join(src, file), path.join(dest, file));
      }
    }
  }

  /** Save a single file to history before it's overwritten by a revision. */
  saveFileToHistory(id: string, filename: string, version: number) {
    const src = path.join(this.contentDir(id), filename);
    if (!fs.existsSync(src)) return; // New file, nothing to save
    const dest = this.historyDir(id, version);
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(src, path.join(dest, filename));
  }

  // ---- Terminal States ----

  moveToTerminal(id: string, bucket: "approved" | "rejected") {
    const src = this.reviewDir(id);
    const dest = path.join(this.projectDir, bucket, id);
    fs.mkdirSync(dest, { recursive: true });
    copyDirRecursive(src, dest);
  }

  // ---- Listing ----

  listReviews(filter?: { stage?: Stage; source_agent?: string }): DeliverableSummary[] {
    const results: DeliverableSummary[] = [];
    const reviewRoot = path.join(this.projectDir, "review");
    if (!fs.existsSync(reviewRoot)) return results;

    for (const id of fs.readdirSync(reviewRoot)) {
      try {
        const meta = this.readMeta(id);
        const status = this.readStatus(id);
        if (filter?.stage && status.stage !== filter.stage) continue;
        if (filter?.source_agent && meta.source_agent !== filter.source_agent) continue;
        const files = this.listFiles(id);
        results.push({
          id,
          title: meta.title,
          source_agent: meta.source_agent,
          policy: meta.policy,
          content_type: meta.content_type,
          stage: status.stage,
          score: status.score,
          entered_stage_at: status.entered_stage_at,
          submitted_at: status.submitted_at,
          revision_number: status.revision_number,
          is_folder: files.length > 1 || !!meta.folder_strategy,
          file_count: files.length || null,
        });
      } catch {
        // Skip malformed reviews
      }
    }
    return results;
  }

  getFullDeliverable(id: string, apiBaseUrl?: string): Deliverable {
    const meta = this.readMeta(id);
    const status = this.readStatus(id);
    const files = this.listFiles(id);
    const objectiveResults = this.readObjectiveResults(id);
    const subjectiveResults = this.readSubjectiveResults(id);
    const feedback = this.readFeedback(id);

    // Compute preview_url for each file
    if (apiBaseUrl) {
      for (const f of files) {
        f.preview_url = `${apiBaseUrl}/deliverables/${id}/files/${f.filename}`;
      }
    }

    // Read first text file as content preview
    let content = "";
    const textFile = files.find((f) => f.content_type.startsWith("text/"));
    if (textFile) {
      try {
        const { content: c } = this.readFile(id, textFile.filename);
        content = c;
      } catch { /* ignore */ }
    }

    return {
      id,
      title: meta.title,
      source_agent: meta.source_agent,
      policy: meta.policy,
      content_type: meta.content_type,
      stage: status.stage,
      score: status.score,
      entered_stage_at: status.entered_stage_at,
      submitted_at: status.submitted_at,
      revision_number: status.revision_number,
      is_folder: files.length > 1 || !!meta.folder_strategy,
      file_count: files.length || null,
      content,
      brief: meta.brief,
      objective_results: objectiveResults,
      subjective_results: subjectiveResults,
      feedback,
      history: [],  // TODO: read from history/ dirs
      files: files.length > 0 ? files : null,
      folder_strategy: meta.folder_strategy ?? null,
    };
  }

  // ---- Policies ----

  listPolicies(): PolicyConfig[] {
    const dir = path.join(this.projectDir, "policies");
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
  }

  readPolicy(name: string): PolicyConfig {
    const filePath = path.join(this.projectDir, "policies", `${name}.json`);
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  writePolicy(name: string, policy: PolicyConfig) {
    const filePath = path.join(this.projectDir, "policies", `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(policy, null, 2));
  }

  deletePolicy(name: string) {
    const filePath = path.join(this.projectDir, "policies", `${name}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

// ---- Helpers ----

function guessContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".html": "text/html",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
  };
  return map[ext] || "application/octet-stream";
}

function copyDirRecursive(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @aros/server test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/storage.ts server/src/__tests__/storage.test.ts server/package.json
git commit -m "feat(server): add filesystem storage layer with tests"
```

---

## Chunk 2: Pipeline Engine — Objective + Subjective + Notifications

### Task 3: Objective Stage Checks

Automated validation checks (file size, format, image dimensions, word count, profanity).

**Files:**
- Create: `server/src/pipeline/objective.ts`
- Create: `server/src/__tests__/objective.test.ts`

- [ ] **Step 1: Write tests**

`server/src/__tests__/objective.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { runObjectiveChecks, type ObjectiveCheckConfig } from "../pipeline/objective.js";

describe("runObjectiveChecks", () => {
  const makeFile = (name: string, content: string, contentType: string) => ({
    filename: name,
    content,
    contentType,
    sizeBytes: Buffer.byteLength(content),
  });

  it("passes when file is under size limit", () => {
    const checks: ObjectiveCheckConfig[] = [
      { name: "file_size", config: { max_mb: 1 }, severity: "blocking" },
    ];
    const files = [makeFile("test.txt", "hello", "text/plain")];
    const results = runObjectiveChecks(files, checks);
    expect(results[0].passed).toBe(true);
  });

  it("fails when file exceeds size limit", () => {
    const checks: ObjectiveCheckConfig[] = [
      { name: "file_size", config: { max_mb: 0.000001 }, severity: "blocking" },
    ];
    const files = [makeFile("test.txt", "hello world", "text/plain")];
    const results = runObjectiveChecks(files, checks);
    expect(results[0].passed).toBe(false);
  });

  it("passes when format matches allowed list", () => {
    const checks: ObjectiveCheckConfig[] = [
      { name: "format_check", config: { allowed: ["text/*"] }, severity: "blocking" },
    ];
    const files = [makeFile("test.md", "# Hi", "text/markdown")];
    const results = runObjectiveChecks(files, checks);
    expect(results[0].passed).toBe(true);
  });

  it("fails when format not in allowed list", () => {
    const checks: ObjectiveCheckConfig[] = [
      { name: "format_check", config: { allowed: ["image/*"] }, severity: "blocking" },
    ];
    const files = [makeFile("test.exe", "binary", "application/octet-stream")];
    const results = runObjectiveChecks(files, checks);
    expect(results[0].passed).toBe(false);
  });

  it("word_count passes when within range", () => {
    const checks: ObjectiveCheckConfig[] = [
      { name: "word_count", config: { min: 1, max: 100 }, severity: "warning" },
    ];
    const files = [makeFile("doc.md", "hello world foo bar", "text/markdown")];
    const results = runObjectiveChecks(files, checks);
    expect(results[0].passed).toBe(true);
  });

  it("word_count fails when below min", () => {
    const checks: ObjectiveCheckConfig[] = [
      { name: "word_count", config: { min: 100 }, severity: "warning" },
    ];
    const files = [makeFile("doc.md", "too short", "text/markdown")];
    const results = runObjectiveChecks(files, checks);
    expect(results[0].passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aros/server test -- objective
```

- [ ] **Step 3: Implement objective checks**

`server/src/pipeline/objective.ts`:

```typescript
import type { ObjectiveCheck } from "@aros/types";

export interface ObjectiveCheckConfig {
  name: string;
  config: Record<string, unknown>;
  severity: "blocking" | "warning";
}

interface FileInput {
  filename: string;
  content: string;
  contentType: string;
  sizeBytes: number;
}

type CheckFn = (file: FileInput, config: Record<string, unknown>) => { passed: boolean; details: string };

const CHECK_REGISTRY: Record<string, CheckFn> = {
  file_size: (file, config) => {
    const maxBytes = ((config.max_mb as number) || 10) * 1024 * 1024;
    const passed = file.sizeBytes <= maxBytes;
    return {
      passed,
      details: passed
        ? `${file.filename}: ${file.sizeBytes} bytes (under ${maxBytes} limit)`
        : `${file.filename}: ${file.sizeBytes} bytes exceeds ${maxBytes} limit`,
    };
  },

  format_check: (file, config) => {
    const allowed = (config.allowed as string[]) || [];
    const passed = allowed.some((pattern) => {
      if (pattern.endsWith("/*")) {
        return file.contentType.startsWith(pattern.slice(0, -1));
      }
      return file.contentType === pattern;
    });
    return {
      passed,
      details: passed
        ? `${file.filename}: ${file.contentType} is allowed`
        : `${file.filename}: ${file.contentType} not in allowed list [${allowed.join(", ")}]`,
    };
  },

  word_count: (file, config) => {
    if (!file.contentType.startsWith("text/")) {
      return { passed: true, details: `${file.filename}: skipped (not text)` };
    }
    const words = file.content.trim().split(/\s+/).filter(Boolean).length;
    const min = (config.min as number) ?? 0;
    const max = (config.max as number) ?? Infinity;
    const passed = words >= min && words <= max;
    return {
      passed,
      details: passed
        ? `${file.filename}: ${words} words (within ${min}-${max})`
        : `${file.filename}: ${words} words (expected ${min}-${max})`,
    };
  },

  image_dimensions: (file, config) => {
    // Basic SVG viewBox check
    if (file.contentType === "image/svg+xml") {
      const match = file.content.match(/viewBox=["'](\d+)\s+(\d+)\s+(\d+)\s+(\d+)["']/);
      if (match) {
        const w = parseInt(match[3], 10);
        const h = parseInt(match[4], 10);
        const minW = (config.min_width as number) ?? 0;
        const maxW = (config.max_width as number) ?? Infinity;
        const minH = (config.min_height as number) ?? 0;
        const maxH = (config.max_height as number) ?? Infinity;
        const passed = w >= minW && w <= maxW && h >= minH && h <= maxH;
        return { passed, details: `${file.filename}: ${w}x${h}` };
      }
    }
    return { passed: true, details: `${file.filename}: dimensions not detectable` };
  },

  profanity_check: (file, config) => {
    if (!file.contentType.startsWith("text/")) {
      return { passed: true, details: `${file.filename}: skipped (not text)` };
    }
    // Very basic check — production would use a proper library
    const words = ((config.words as string[]) || ["fuck", "shit", "damn", "ass", "bitch"]);
    const lower = file.content.toLowerCase();
    const found = words.filter((w) => lower.includes(w));
    return {
      passed: found.length === 0,
      details: found.length > 0
        ? `${file.filename}: found profanity: ${found.join(", ")}`
        : `${file.filename}: clean`,
    };
  },
};

export function runObjectiveChecks(files: FileInput[], checks: ObjectiveCheckConfig[]): ObjectiveCheck[] {
  const results: ObjectiveCheck[] = [];
  for (const check of checks) {
    const fn = CHECK_REGISTRY[check.name];
    if (!fn) {
      results.push({ name: check.name, passed: false, severity: check.severity, details: `Unknown check: ${check.name}` });
      continue;
    }
    for (const file of files) {
      const { passed, details } = fn(file, check.config);
      results.push({ name: check.name, passed, severity: check.severity, details });
    }
  }
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @aros/server test -- objective
```

- [ ] **Step 5: Commit**

```bash
git add server/src/pipeline/objective.ts server/src/__tests__/objective.test.ts
git commit -m "feat(server): add objective stage checks (file_size, format, word_count, dimensions, profanity)"
```

---

### Task 4: Subjective Stage (Claude API Review)

AI-powered evaluation using the Anthropic SDK.

**Files:**
- Create: `server/src/pipeline/subjective.ts`
- Create: `server/src/__tests__/subjective.test.ts`

- [ ] **Step 1: Write test**

`server/src/__tests__/subjective.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { buildSubjectivePrompt, parseSubjectiveResponse, computeWeightedScore } from "../pipeline/subjective.js";
import type { PolicySubjectiveCriterion } from "@aros/types";

describe("subjective", () => {
  const criteria: PolicySubjectiveCriterion[] = [
    { name: "relevance", description: "Match to brief", weight: 3, scale: 10 },
    { name: "quality", description: "Production quality", weight: 2, scale: 10 },
  ];

  describe("buildSubjectivePrompt", () => {
    it("includes brief and criteria in the prompt", () => {
      const { messages } = buildSubjectivePrompt(
        "Create a hero image",
        [{ type: "text", content: "# My document" }],
        criteria
      );
      const text = JSON.stringify(messages);
      expect(text).toContain("Create a hero image");
      expect(text).toContain("relevance");
      expect(text).toContain("quality");
    });

    it("includes base64 image content blocks for images", () => {
      const { messages } = buildSubjectivePrompt(
        "Create image",
        [{ type: "image", content: "base64data", mediaType: "image/png" }],
        criteria
      );
      const text = JSON.stringify(messages);
      expect(text).toContain("base64data");
      expect(text).toContain("image/png");
    });
  });

  describe("parseSubjectiveResponse", () => {
    it("parses valid JSON response with scores", () => {
      const raw = JSON.stringify({
        scores: [
          { name: "relevance", score: 8, rationale: "Good match" },
          { name: "quality", score: 7, rationale: "High quality" },
        ],
      });
      const result = parseSubjectiveResponse(raw, criteria);
      expect(result).toHaveLength(2);
      expect(result[0].score).toBe(8);
      expect(result[0].weight).toBe(3);
    });
  });

  describe("computeWeightedScore", () => {
    it("computes weighted average", () => {
      const results = [
        { name: "relevance", score: 8, weight: 3, scale: 10, rationale: "" },
        { name: "quality", score: 6, weight: 2, scale: 10, rationale: "" },
      ];
      // (8*3 + 6*2) / (3+2) = (24 + 12) / 5 = 7.2
      expect(computeWeightedScore(results)).toBeCloseTo(7.2);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aros/server test -- subjective
```

- [ ] **Step 3: Implement subjective stage**

`server/src/pipeline/subjective.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { SubjectiveCriterion, PolicySubjectiveCriterion } from "@aros/types";

interface ContentBlock {
  type: "text" | "image";
  content: string;
  mediaType?: string;
}

export function buildSubjectivePrompt(
  brief: string,
  contentBlocks: ContentBlock[],
  criteria: PolicySubjectiveCriterion[]
) {
  const system = `You are a quality reviewer evaluating deliverables against specific criteria.
Evaluate the submitted content against the brief and criteria below.
Return ONLY a JSON object with this exact structure:
{
  "scores": [
    { "name": "<criterion_name>", "score": <0-10>, "rationale": "<brief explanation>" }
  ]
}`;

  const criteriaText = criteria
    .map((c) => `- **${c.name}** (weight: ${c.weight}): ${c.description}`)
    .join("\n");

  const userContent: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  userContent.push({
    type: "text",
    text: `## Brief\n${brief}\n\n## Evaluation Criteria\n${criteriaText}\n\n## Deliverable Content`,
  });

  for (const block of contentBlocks) {
    if (block.type === "image" && block.mediaType) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: block.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: block.content,
        },
      });
    } else {
      userContent.push({ type: "text", text: block.content });
    }
  }

  return {
    system,
    messages: [{ role: "user" as const, content: userContent }],
  };
}

export function parseSubjectiveResponse(
  raw: string,
  criteria: PolicySubjectiveCriterion[]
): SubjectiveCriterion[] {
  // Extract JSON from possible markdown code blocks
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : raw;
  const parsed = JSON.parse(jsonStr);

  return parsed.scores.map((s: { name: string; score: number; rationale: string }) => {
    const criterion = criteria.find((c) => c.name === s.name);
    return {
      name: s.name,
      score: s.score,
      weight: criterion?.weight ?? 1,
      scale: criterion?.scale ?? 10,
      rationale: s.rationale,
    };
  });
}

export function computeWeightedScore(results: SubjectiveCriterion[]): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const r of results) {
    weightedSum += r.score * r.weight;
    totalWeight += r.weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

export async function runSubjectiveReview(
  brief: string,
  contentBlocks: ContentBlock[],
  criteria: PolicySubjectiveCriterion[],
  model: string
): Promise<{ results: SubjectiveCriterion[]; score: number } | { skipped: true; reason: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[AROS] ANTHROPIC_API_KEY not set — skipping subjective review");
    return { skipped: true, reason: "ANTHROPIC_API_KEY not set" };
  }

  const client = new Anthropic({ apiKey });
  const { system, messages } = buildSubjectivePrompt(brief, contentBlocks, criteria);

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    system,
    messages,
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const results = parseSubjectiveResponse(text, criteria);
  const score = computeWeightedScore(results);

  return { results, score };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @aros/server test -- subjective
```

- [ ] **Step 5: Commit**

```bash
git add server/src/pipeline/subjective.ts server/src/__tests__/subjective.test.ts
git commit -m "feat(server): add subjective stage with Claude API review"
```

---

### Task 5: Pipeline Engine (State Machine)

Orchestrates the full pipeline: draft → objective → subjective → human → terminal.

**Files:**
- Create: `server/src/pipeline/engine.ts`
- Create: `server/src/__tests__/engine.test.ts`

- [ ] **Step 1: Write tests**

`server/src/__tests__/engine.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Storage } from "../storage.js";
import { PipelineEngine } from "../pipeline/engine.js";

let tmpDir: string;
let storage: Storage;
let engine: PipelineEngine;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-engine-"));
  storage = new Storage(tmpDir);
  storage.init();
  engine = new PipelineEngine(storage);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("PipelineEngine", () => {
  it("submits a deliverable through objective stage", async () => {
    const id = storage.createReview({
      title: "Test", brief: "Brief", policy: "default",
      source_agent: "agent", content_type: "text/plain",
    });
    storage.addFile(id, "doc.txt", "hello world", "text/plain", "utf-8");

    const result = await engine.submit(id);
    const status = storage.readStatus(id);
    // Should have passed objective and advanced
    expect(["subjective", "human"]).toContain(status.stage);
  });

  it("moves to revision_requested when objective fails", async () => {
    // Write a policy that only allows images
    const imageOnlyPolicy = {
      name: "images-only",
      stages: ["objective", "human"],
      max_revisions: 3,
      objective: {
        checks: [{ name: "format_check", config: { allowed: ["image/*"] }, severity: "blocking" }],
        fail_threshold: 1,
      },
      human: { required: true },
    };
    storage.writePolicy("images-only", imageOnlyPolicy);

    const id = storage.createReview({
      title: "Test", brief: "Brief", policy: "images-only",
      source_agent: "agent", content_type: "text/plain",
    });
    storage.addFile(id, "doc.txt", "not an image", "text/plain", "utf-8");

    await engine.submit(id);
    const status = storage.readStatus(id);
    expect(status.stage).toBe("revision_requested");
    expect(status.rejecting_stage).toBe("objective");
  });

  it("handles human decision: approved", async () => {
    const id = storage.createReview({
      title: "Test", brief: "Brief", policy: "default",
      source_agent: "agent", content_type: "text/plain",
    });
    storage.addFile(id, "doc.txt", "hello", "text/plain", "utf-8");
    // Manually set to human stage
    storage.updateStatus(id, { stage: "human", entered_stage_at: new Date().toISOString() });

    await engine.decide(id, { decision: "approved" });
    const status = storage.readStatus(id);
    expect(status.stage).toBe("approved");
    expect(fs.existsSync(path.join(tmpDir, "approved", id, "content", "doc.txt"))).toBe(true);
  });

  it("handles human decision: revision_requested", async () => {
    const id = storage.createReview({
      title: "Test", brief: "Brief", policy: "default",
      source_agent: "agent", content_type: "text/plain",
    });
    storage.updateStatus(id, { stage: "human", entered_stage_at: new Date().toISOString() });

    await engine.decide(id, { decision: "revision_requested", reason: "Needs work" });
    const status = storage.readStatus(id);
    expect(status.stage).toBe("revision_requested");
    expect(status.rejecting_stage).toBe("human");
  });

  it("handles complete_revision: re-enters at rejecting stage", async () => {
    const id = storage.createReview({
      title: "Test", brief: "Brief", policy: "default",
      source_agent: "agent", content_type: "text/plain",
    });
    storage.addFile(id, "doc.txt", "hello", "text/plain", "utf-8");
    storage.updateStatus(id, {
      stage: "revision_requested",
      rejecting_stage: "human",
      revision_number: 1,
      entered_stage_at: new Date().toISOString(),
    });

    const result = await engine.completeRevision(id);
    const status = storage.readStatus(id);
    expect(status.stage).toBe("human");
  });

  it("auto-rejects when max revisions exceeded", async () => {
    const id = storage.createReview({
      title: "Test", brief: "Brief", policy: "default",
      source_agent: "agent", content_type: "text/plain",
    });
    storage.updateStatus(id, {
      stage: "revision_requested",
      rejecting_stage: "human",
      revision_number: 3, // default max is 3
      entered_stage_at: new Date().toISOString(),
    });

    await engine.completeRevision(id);
    const status = storage.readStatus(id);
    expect(status.stage).toBe("rejected");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @aros/server test -- engine
```

- [ ] **Step 3: Implement pipeline engine**

`server/src/pipeline/engine.ts`:

```typescript
import { Storage } from "../storage.js";
import { runObjectiveChecks, type ObjectiveCheckConfig } from "./objective.js";
import { runSubjectiveReview } from "./subjective.js";
import type { DecisionPayload, Feedback, Stage, PolicyConfig } from "@aros/types";

export type SSEEmitFn = (event: string, data: Record<string, unknown>) => void;

export class PipelineEngine {
  private storage: Storage;
  private emitSSE?: SSEEmitFn;

  constructor(storage: Storage, emitSSE?: SSEEmitFn) {
    this.storage = storage;
    this.emitSSE = emitSSE;
  }

  async submit(id: string): Promise<{ stage: string; message: string }> {
    const meta = this.storage.readMeta(id);
    const policy = this.storage.readPolicy(meta.policy);

    this.storage.updateStatus(id, {
      submitted_at: new Date().toISOString(),
    });

    this.emitSSE?.("deliverable:submitted", { id, title: meta.title, stage: "objective" });

    return this.advancePipeline(id, policy, "draft");
  }

  async decide(id: string, payload: DecisionPayload): Promise<void> {
    const meta = this.storage.readMeta(id);
    const now = new Date().toISOString();

    if (payload.decision === "approved") {
      this.storage.updateStatus(id, { stage: "approved", entered_stage_at: now });
      this.storage.moveToTerminal(id, "approved");
      this.emitSSE?.("deliverable:decided", { id, decision: "approved" });
      await this.notify(id, "approved");
    } else if (payload.decision === "rejected") {
      const feedback: Feedback = {
        stage: "human",
        decision: "rejected",
        summary: payload.reason || "Rejected by reviewer",
        issues: [],
        reviewer: "human",
        timestamp: now,
      };
      this.storage.writeFeedback(id, feedback);
      this.storage.updateStatus(id, { stage: "rejected", entered_stage_at: now });
      this.storage.moveToTerminal(id, "rejected");
      this.emitSSE?.("deliverable:decided", { id, decision: "rejected" });
      await this.notify(id, "rejected");
    } else {
      // revision_requested
      const feedback: Feedback = {
        stage: "human",
        decision: "revision_requested",
        summary: payload.reason || "Revisions needed",
        issues: [],
        reviewer: "human",
        timestamp: now,
      };
      this.storage.writeFeedback(id, feedback);
      this.storage.updateStatus(id, {
        stage: "revision_requested",
        rejecting_stage: "human",
        entered_stage_at: now,
      });
      this.emitSSE?.("deliverable:stage_changed", {
        id, title: meta.title, old_stage: "human", new_stage: "revision_requested",
      });
      await this.notify(id, "revision_requested");
    }
  }

  async completeRevision(id: string): Promise<{ stage: string; message: string }> {
    const status = this.storage.readStatus(id);
    const meta = this.storage.readMeta(id);
    const policy = this.storage.readPolicy(meta.policy);

    if (status.stage !== "revision_requested") {
      throw new Error(`Cannot complete revision: deliverable is in ${status.stage}`);
    }

    // Check max revisions
    if (status.revision_number >= policy.max_revisions) {
      this.storage.updateStatus(id, { stage: "rejected", entered_stage_at: new Date().toISOString() });
      this.storage.moveToTerminal(id, "rejected");
      this.emitSSE?.("deliverable:decided", { id, decision: "rejected" });
      return { stage: "rejected", message: `Max revisions (${policy.max_revisions}) exceeded` };
    }

    const reenterStage = (status.rejecting_stage || "objective") as Stage;
    this.storage.updateStatus(id, {
      revision_number: status.revision_number + 1,
      entered_stage_at: new Date().toISOString(),
    });

    this.emitSSE?.("deliverable:revised", { id, revision_number: status.revision_number + 1 });

    // Re-enter pipeline AT the rejecting stage (not before it).
    // Per spec Section 5.5:
    //   objective rejected → re-runs from objective
    //   subjective rejected → re-runs from subjective
    //   human rejected → re-enters human queue (NOT re-running subjective)
    return this.advancePipelineFromStage(id, policy, reenterStage);
  }

  /** Advance pipeline starting from `fromStage`. Called on initial submit (fromStage="draft")
   *  and on revision re-entry (fromStage = the rejecting stage). */
  private async advancePipeline(
    id: string,
    policy: PolicyConfig,
    fromStage: string
  ): Promise<{ stage: string; message: string }> {
    // On initial submit, start from the first stage in the policy
    return this.advancePipelineFromStage(id, policy, fromStage === "draft" ? policy.stages[0] : fromStage as Stage);
  }

  private async advancePipelineFromStage(
    id: string,
    policy: PolicyConfig,
    startStage: Stage
  ): Promise<{ stage: string; message: string }> {
    const stages = policy.stages;
    const meta = this.storage.readMeta(id);
    const now = () => new Date().toISOString();

    // Find starting index — start AT the given stage, not after it
    let startIdx = stages.indexOf(startStage);
    if (startIdx < 0) startIdx = 0;

    for (let i = startIdx; i < stages.length; i++) {
      const stage = stages[i];

      if (stage === "objective") {
        this.storage.updateStatus(id, { stage: "objective", entered_stage_at: now() });
        this.emitSSE?.("deliverable:stage_changed", {
          id, title: meta.title, old_stage: fromStage, new_stage: "objective",
        });

        const files = this.storage.listFiles(id);
        const fileInputs = files.map((f) => {
          const { content } = this.storage.readFile(id, f.filename);
          return { filename: f.filename, content, contentType: f.content_type, sizeBytes: f.size_bytes };
        });

        const checks = (policy.objective?.checks || []) as ObjectiveCheckConfig[];
        const results = runObjectiveChecks(fileInputs, checks);
        this.storage.writeObjectiveResults(id, results);

        const failThreshold = policy.objective?.fail_threshold ?? 1;
        const blockingFailures = results.filter((r) => !r.passed && r.severity === "blocking");

        if (blockingFailures.length >= failThreshold) {
          const feedback: Feedback = {
            stage: "objective",
            decision: "revision_requested",
            summary: `${blockingFailures.length} blocking check(s) failed`,
            issues: blockingFailures.map((r) => ({
              file: null,
              location: "",
              category: r.name,
              severity: "critical",
              description: r.details,
              suggestion: `Fix the ${r.name} issue`,
            })),
            reviewer: "aros-objective",
            timestamp: now(),
          };
          this.storage.writeFeedback(id, feedback);
          this.storage.updateStatus(id, {
            stage: "revision_requested",
            rejecting_stage: "objective",
            entered_stage_at: now(),
          });
          this.emitSSE?.("deliverable:stage_changed", {
            id, title: meta.title, old_stage: "objective", new_stage: "revision_requested",
          });
          return { stage: "revision_requested", message: feedback.summary };
        }
        continue;
      }

      if (stage === "subjective") {
        this.storage.updateStatus(id, { stage: "subjective", entered_stage_at: now() });
        this.emitSSE?.("deliverable:stage_changed", {
          id, title: meta.title, old_stage: stages[i - 1] || "draft", new_stage: "subjective",
        });

        const criteria = policy.subjective?.criteria || [];
        const passThreshold = policy.subjective?.pass_threshold ?? 6.0;
        const config = this.storage.getConfig();

        const files = this.storage.listFiles(id);
        const contentBlocks = files.map((f) => {
          const { content, encoding } = this.storage.readFile(id, f.filename);
          if (f.content_type.startsWith("image/") && encoding === "base64") {
            return { type: "image" as const, content, mediaType: f.content_type };
          }
          return { type: "text" as const, content };
        });

        const result = await runSubjectiveReview(meta.brief, contentBlocks, criteria, config.subjective_model);

        if ("skipped" in result) {
          this.storage.writeSubjectiveResults(id, result);
          continue;
        }

        this.storage.writeSubjectiveResults(id, result.results);
        this.storage.updateStatus(id, { score: result.score });

        if (result.score < passThreshold) {
          const feedback: Feedback = {
            stage: "subjective",
            decision: "revision_requested",
            summary: `Score ${result.score.toFixed(1)} below threshold ${passThreshold}`,
            issues: result.results
              .filter((r) => r.score < passThreshold)
              .map((r) => ({
                file: null,
                location: "",
                category: r.name,
                severity: "major" as const,
                description: `Score: ${r.score}/${r.scale} — ${r.rationale}`,
                suggestion: `Improve ${r.name}`,
              })),
            reviewer: "aros-subjective",
            timestamp: now(),
          };
          this.storage.writeFeedback(id, feedback);
          this.storage.updateStatus(id, {
            stage: "revision_requested",
            rejecting_stage: "subjective",
            entered_stage_at: now(),
          });
          this.emitSSE?.("deliverable:stage_changed", {
            id, title: meta.title, old_stage: "subjective", new_stage: "revision_requested",
          });
          return { stage: "revision_requested", message: feedback.summary };
        }
        continue;
      }

      if (stage === "human") {
        this.storage.updateStatus(id, { stage: "human", entered_stage_at: now() });
        this.emitSSE?.("deliverable:stage_changed", {
          id, title: meta.title, old_stage: stages[i - 1] || "draft", new_stage: "human", score: this.storage.readStatus(id).score,
        });
        return { stage: "human", message: "Awaiting human review" };
      }
    }

    // If no stages or all passed with no human stage
    this.storage.updateStatus(id, { stage: "approved", entered_stage_at: now() });
    this.storage.moveToTerminal(id, "approved");
    return { stage: "approved", message: "Auto-approved (no human stage)" };
  }

  private async notify(id: string, event: "approved" | "revision_requested" | "rejected") {
    // Notification dispatch — implemented in Task 6
    const meta = this.storage.readMeta(id);
    if (!meta.notification) return;
    if (!meta.notification.events.includes(event)) return;
    // Driver dispatch will be wired in Task 6
  }
}

// No helper needed — advancePipelineFromStage starts AT the given stage directly.
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @aros/server test -- engine
```

- [ ] **Step 5: Commit**

```bash
git add server/src/pipeline/engine.ts server/src/__tests__/engine.test.ts
git commit -m "feat(server): add pipeline engine state machine (objective → subjective → human)"
```

---

### Task 6: Notification System + Paperclip Driver

**Files:**
- Create: `server/src/notifications/driver.ts`
- Create: `server/src/notifications/paperclip.ts`
- Create: `server/src/__tests__/paperclip-driver.test.ts`

- [ ] **Step 1: Write driver interface**

`server/src/notifications/driver.ts`:

```typescript
import type { Feedback } from "@aros/types";

export interface NotificationDriver {
  name: string;
  validateTarget(target: Record<string, unknown>): { valid: boolean; error?: string };
  send(
    event: "approved" | "revision_requested" | "rejected",
    deliverable: { review_id: string; title: string; revision_number: number },
    feedback: Feedback | null,
    target: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }>;
}

const drivers = new Map<string, NotificationDriver>();

export function registerDriver(driver: NotificationDriver) {
  drivers.set(driver.name, driver);
}

export function getDriver(name: string): NotificationDriver | undefined {
  return drivers.get(name);
}
```

- [ ] **Step 2: Write Paperclip driver test**

`server/src/__tests__/paperclip-driver.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaperclipDriver } from "../notifications/paperclip.js";

describe("PaperclipDriver", () => {
  const driver = new PaperclipDriver();

  describe("validateTarget", () => {
    it("passes with valid target", () => {
      const result = driver.validateTarget({
        api_url: "http://localhost:3100",
        company_id: "comp-001",
        issue_id: "ISS-123",
      });
      expect(result.valid).toBe(true);
    });

    it("fails without api_url", () => {
      const result = driver.validateTarget({ company_id: "comp-001", issue_id: "ISS-123" });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("api_url");
    });

    it("fails without issue_id", () => {
      const result = driver.validateTarget({ api_url: "http://localhost:3100", company_id: "comp-001" });
      expect(result.valid).toBe(false);
    });
  });

  describe("send", () => {
    it("sends approved notification", async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: () => ({}) });
      global.fetch = fetchSpy;

      const result = await driver.send(
        "approved",
        { review_id: "d-20260311-001", title: "Test", revision_number: 0 },
        null,
        { api_url: "http://localhost:3100", company_id: "comp-001", issue_id: "ISS-123" }
      );

      expect(result.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2); // comment + status update
    });
  });
});
```

- [ ] **Step 3: Implement Paperclip driver**

`server/src/notifications/paperclip.ts`:

```typescript
import type { NotificationDriver } from "./driver.js";
import type { Feedback } from "@aros/types";

export class PaperclipDriver implements NotificationDriver {
  name = "paperclip";

  validateTarget(target: Record<string, unknown>): { valid: boolean; error?: string } {
    const required = ["api_url", "company_id", "issue_id"];
    for (const key of required) {
      if (!target[key]) {
        return { valid: false, error: `Missing required field: ${key}` };
      }
    }
    return { valid: true };
  }

  async send(
    event: "approved" | "revision_requested" | "rejected",
    deliverable: { review_id: string; title: string; revision_number: number },
    feedback: Feedback | null,
    target: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    const { api_url, company_id, issue_id } = target as {
      api_url: string; company_id: string; issue_id: string;
    };
    const baseUrl = `${api_url}/api/companies/${company_id}/issues/${issue_id}`;

    try {
      // Post comment
      let commentContent: string;
      if (event === "approved") {
        commentContent = `## Approved\n\nDeliverable "${deliverable.title}" approved by human reviewer.`;
      } else if (event === "rejected") {
        commentContent = formatFeedbackComment("Rejected", deliverable.title, feedback);
      } else {
        commentContent = formatFeedbackComment("Revision Requested", deliverable.title, feedback);
      }

      await fetch(`${baseUrl}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentContent, authorAgentId: null }),
      });

      // Update issue status for terminal decisions
      if (event === "approved" || event === "rejected") {
        const status = event === "approved" ? "done" : "blocked";
        await fetch(baseUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[AROS] Paperclip notification failed: ${message}`);
      return { success: false, error: message };
    }
  }
}

function formatFeedbackComment(heading: string, title: string, feedback: Feedback | null): string {
  let md = `## ${heading}\n\nDeliverable: "${title}"\n\n`;
  if (feedback) {
    md += `**Summary:** ${feedback.summary}\n\n`;
    if (feedback.issues.length > 0) {
      md += `### Issues\n\n`;
      for (const issue of feedback.issues) {
        md += `- **[${issue.severity}]** ${issue.description}`;
        if (issue.suggestion) md += ` → ${issue.suggestion}`;
        md += `\n`;
      }
    }
  }
  return md;
}
```

- [ ] **Step 4: Wire notifications into PipelineEngine**

Update `server/src/pipeline/engine.ts` — replace the `notify` stub:

```typescript
// At top of file, add import:
import { getDriver } from "../notifications/driver.js";

// Replace the notify method:
private async notify(id: string, event: "approved" | "revision_requested" | "rejected") {
  const meta = this.storage.readMeta(id);
  if (!meta.notification) return;
  if (!meta.notification.events.includes(event)) return;

  const driver = getDriver(meta.notification.driver);
  if (!driver) {
    console.warn(`[AROS] Unknown notification driver: ${meta.notification.driver}`);
    return;
  }

  const status = this.storage.readStatus(id);
  const feedback = this.storage.readFeedback(id);
  const result = await driver.send(
    event,
    { review_id: id, title: meta.title, revision_number: status.revision_number },
    feedback,
    meta.notification.target
  );

  if (!result.success) {
    console.error(`[AROS] Notification failed for ${id}: ${result.error}`);
  }
}
```

- [ ] **Step 5: Run all tests**

```bash
pnpm --filter @aros/server test
```

- [ ] **Step 6: Commit**

```bash
git add server/src/notifications/ server/src/__tests__/paperclip-driver.test.ts server/src/pipeline/engine.ts
git commit -m "feat(server): add notification system with Paperclip driver"
```

---

## Chunk 3: Express Server — REST API + SSE

### Task 7: Express Server with REST Routes

**Files:**
- Create: `server/src/index.ts`
- Create: `server/src/routes/deliverables.ts`
- Create: `server/src/routes/policies.ts`
- Create: `server/src/routes/pipeline.ts`
- Create: `server/src/routes/files.ts`
- Create: `server/src/sse.ts`

- [ ] **Step 1: Create SSE manager**

`server/src/sse.ts`:

```typescript
import type { Response } from "express";
import chokidar from "chokidar";

export class SSEBroadcaster {
  private clients = new Set<Response>();
  private watcher: chokidar.FSWatcher | null = null;

  addClient(res: Response) {
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  emit(event: string, data: Record<string, unknown>) {
    const payload = JSON.stringify({ type: event, data });
    for (const client of this.clients) {
      client.write(`data: ${payload}\n\n`);
    }
  }

  startWatching(reviewDir: string) {
    this.watcher = chokidar.watch(reviewDir, {
      ignoreInitial: true,
      depth: 3,
    });
    // File system events trigger refreshes — the pipeline engine
    // calls emit() directly for semantic events. The watcher is a
    // backup for external changes.
  }

  stop() {
    this.watcher?.close();
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();
  }
}
```

- [ ] **Step 2: Create deliverables routes**

`server/src/routes/deliverables.ts`:

```typescript
import { Router } from "express";
import type { Storage } from "../storage.js";
import type { PipelineEngine } from "../pipeline/engine.js";
import type { DecisionPayload, Stage } from "@aros/types";

export function deliverableRoutes(storage: Storage, engine: PipelineEngine, apiBaseUrl: string): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const stage = req.query.stage as Stage | undefined;
    const reviews = storage.listReviews(stage ? { stage } : undefined);
    res.json(reviews);
  });

  router.get("/:id", (req, res) => {
    try {
      const deliverable = storage.getFullDeliverable(req.params.id, apiBaseUrl);
      res.json(deliverable);
    } catch {
      res.status(404).json({ error: "Deliverable not found" });
    }
  });

  router.post("/:id/decision", async (req, res) => {
    try {
      const payload = req.body as DecisionPayload;
      await engine.decide(req.params.id, payload);
      res.status(204).end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  return router;
}
```

- [ ] **Step 3: Create files route**

`server/src/routes/files.ts`:

```typescript
import { Router } from "express";
import * as mimeTypes from "mime-types";
import type { Storage } from "../storage.js";

export function fileRoutes(storage: Storage): Router {
  const router = Router();

  router.get("/:id/files/:filename", (req, res) => {
    const filePath = storage.getFilePath(req.params.id, req.params.filename);
    if (!filePath) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const contentType = mimeTypes.lookup(req.params.filename) || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(filePath);
  });

  return router;
}
```

- [ ] **Step 4: Create pipeline routes**

`server/src/routes/pipeline.ts`:

```typescript
import { Router } from "express";
import type { Storage } from "../storage.js";
import type { PipelineCounts, Stage } from "@aros/types";

export function pipelineRoutes(storage: Storage): Router {
  const router = Router();

  router.get("/counts", (_req, res) => {
    const reviews = storage.listReviews();
    const counts: PipelineCounts = {
      in_progress: reviews.filter((r) => ["objective", "subjective"].includes(r.stage)).length,
      pending_human: reviews.filter((r) => r.stage === "human").length,
      awaiting_revisions: reviews.filter((r) => r.stage === "revision_requested").length,
      approved_72h: 0, // TODO: count from approved/ dir with timestamp check
      rejected_72h: 0, // TODO: count from rejected/ dir with timestamp check
    };
    res.json(counts);
  });

  return router;
}
```

- [ ] **Step 5: Create policies routes**

`server/src/routes/policies.ts`:

```typescript
import { Router } from "express";
import type { Storage } from "../storage.js";

export function policyRoutes(storage: Storage): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const policies = storage.listPolicies();
    res.json(policies.map((p) => ({ name: p.name, stages: p.stages, max_revisions: p.max_revisions })));
  });

  router.get("/:name", (req, res) => {
    try {
      const policy = storage.readPolicy(req.params.name);
      res.json(policy);
    } catch {
      res.status(404).json({ error: "Policy not found" });
    }
  });

  router.put("/:name", (req, res) => {
    storage.writePolicy(req.params.name, req.body);
    res.status(204).end();
  });

  router.delete("/:name", (req, res) => {
    storage.deletePolicy(req.params.name);
    res.status(204).end();
  });

  return router;
}
```

- [ ] **Step 6: Create Express app factory**

`server/src/index.ts`:

```typescript
import express from "express";
import * as path from "node:path";
import { Storage } from "./storage.js";
import { PipelineEngine } from "./pipeline/engine.js";
import { SSEBroadcaster } from "./sse.js";
import { deliverableRoutes } from "./routes/deliverables.js";
import { fileRoutes } from "./routes/files.js";
import { pipelineRoutes } from "./routes/pipeline.js";
import { policyRoutes } from "./routes/policies.js";
import { registerDriver } from "./notifications/driver.js";
import { PaperclipDriver } from "./notifications/paperclip.js";

export { Storage } from "./storage.js";
export { PipelineEngine } from "./pipeline/engine.js";

export interface ServerOptions {
  projectDir: string;
  port?: number;
  dashboardDir?: string;
}

export function createServer(options: ServerOptions) {
  const { projectDir, dashboardDir } = options;
  const storage = new Storage(projectDir);
  const config = storage.getConfig();
  const port = options.port ?? config.port;
  const apiBaseUrl = `http://localhost:${port}/api`;

  // Register notification drivers
  registerDriver(new PaperclipDriver());

  // SSE broadcaster
  const sse = new SSEBroadcaster();
  const emitSSE = (event: string, data: Record<string, unknown>) => sse.emit(event, data);

  // Pipeline engine
  const engine = new PipelineEngine(storage, emitSSE);

  // Express app
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  // CORS for development
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (_req.method === "OPTIONS") {
      return res.status(204).end();
    }
    next();
  });

  // API routes
  app.use("/api/deliverables", deliverableRoutes(storage, engine, apiBaseUrl));
  app.use("/api/deliverables", fileRoutes(storage));
  app.use("/api/pipeline", pipelineRoutes(storage));
  app.use("/api/policies", policyRoutes(storage));

  // SSE endpoint
  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    sse.addClient(res);

    // Send heartbeat every 30s
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30_000);
    req.on("close", () => clearInterval(heartbeat));
  });

  // Serve dashboard static files in production
  if (dashboardDir) {
    app.use(express.static(dashboardDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(dashboardDir, "index.html"));
    });
  }

  return {
    app,
    storage,
    engine,
    sse,
    start: () => {
      sse.startWatching(path.join(projectDir, "review"));
      return new Promise<void>((resolve) => {
        app.listen(port, () => resolve());
      });
    },
    stop: () => {
      sse.stop();
    },
    port,
  };
}
```

- [ ] **Step 7: Verify build compiles**

```bash
pnpm --filter @aros/server build
```

- [ ] **Step 8: Commit**

```bash
git add server/src/
git commit -m "feat(server): add Express REST API with SSE, routes, and app factory"
```

---

## Chunk 4: MCP Server — 10 Tools

### Task 8: MCP Server with All 10 Tools

**Files:**
- Create: `mcp/src/index.ts`
- Create: `mcp/src/tools/create-review.ts`
- Create: `mcp/src/tools/add-file.ts`
- Create: `mcp/src/tools/submit-for-review.ts`
- Create: `mcp/src/tools/check-status.ts`
- Create: `mcp/src/tools/get-feedback.ts`
- Create: `mcp/src/tools/list-my-reviews.ts`
- Create: `mcp/src/tools/read-file.ts`
- Create: `mcp/src/tools/submit-revision.ts`
- Create: `mcp/src/tools/complete-revision.ts`
- Create: `mcp/src/tools/list-policies.ts`

- [ ] **Step 1: Create MCP server entry point**

`mcp/src/index.ts`:

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Storage } from "@aros/server/storage.js";
import { PipelineEngine } from "@aros/server/pipeline/engine.js";
import { registerDriver } from "@aros/server/notifications/driver.js";
import { PaperclipDriver } from "@aros/server/notifications/paperclip.js";
import { registerAllTools } from "./tools/index.js";

const projectDir = process.argv.find((_, i, arr) => arr[i - 1] === "--project") || process.cwd();

const storage = new Storage(projectDir);
if (!storage.isInitialized()) {
  console.error(`[AROS MCP] Project not initialized at ${projectDir}. Run 'npx aros' first.`);
  process.exit(1);
}

registerDriver(new PaperclipDriver());
const engine = new PipelineEngine(storage);

const server = new McpServer({
  name: "aros",
  version: "0.1.0",
});

registerAllTools(server, storage, engine);

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("[AROS MCP] Failed to start:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Create tool registration index**

`mcp/src/tools/index.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Storage } from "@aros/server/storage.js";
import type { PipelineEngine } from "@aros/server/pipeline/engine.js";
import { registerCreateReview } from "./create-review.js";
import { registerAddFile } from "./add-file.js";
import { registerSubmitForReview } from "./submit-for-review.js";
import { registerCheckStatus } from "./check-status.js";
import { registerGetFeedback } from "./get-feedback.js";
import { registerListMyReviews } from "./list-my-reviews.js";
import { registerReadFile } from "./read-file.js";
import { registerSubmitRevision } from "./submit-revision.js";
import { registerCompleteRevision } from "./complete-revision.js";
import { registerListPolicies } from "./list-policies.js";

export function registerAllTools(server: McpServer, storage: Storage, engine: PipelineEngine) {
  registerCreateReview(server, storage);
  registerAddFile(server, storage);
  registerSubmitForReview(server, storage, engine);
  registerCheckStatus(server, storage);
  registerGetFeedback(server, storage);
  registerListMyReviews(server, storage);
  registerReadFile(server, storage);
  registerSubmitRevision(server, storage);
  registerCompleteRevision(server, storage, engine);
  registerListPolicies(server, storage);
}
```

- [ ] **Step 3: Implement each tool**

`mcp/src/tools/create-review.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Storage } from "@aros/server/storage.js";
import { getDriver } from "@aros/server/notifications/driver.js";

export function registerCreateReview(server: McpServer, storage: Storage) {
  server.tool(
    "create_review",
    "Start a new review, returns a review_id",
    {
      title: z.string().describe("Human-readable title for the deliverable"),
      brief: z.string().describe("Production instructions — what was asked for"),
      policy: z.string().default("default").describe("Review policy name"),
      source_agent: z.string().describe("ID of the agent submitting"),
      content_type: z.string().default("text/markdown").describe("Primary MIME type"),
      folder_strategy: z.enum(["all_pass", "select", "rank", "categorize"]).optional()
        .describe("For multi-file: how files aggregate into a decision"),
      notification: z.object({
        driver: z.string(),
        target: z.record(z.unknown()),
        events: z.array(z.string()),
      }).optional().describe("Callback config for pipeline decisions"),
    },
    async (params) => {
      // Validate notification target if provided
      if (params.notification) {
        const driver = getDriver(params.notification.driver);
        if (!driver) {
          return { content: [{ type: "text", text: JSON.stringify({ error: `Unknown notification driver: ${params.notification.driver}` }) }] };
        }
        const validation = driver.validateTarget(params.notification.target);
        if (!validation.valid) {
          return { content: [{ type: "text", text: JSON.stringify({ error: `Invalid notification target: ${validation.error}` }) }] };
        }
      }

      const review_id = storage.createReview({
        title: params.title,
        brief: params.brief,
        policy: params.policy,
        source_agent: params.source_agent,
        content_type: params.content_type,
        folder_strategy: params.folder_strategy,
        notification: params.notification,
      });

      return { content: [{ type: "text", text: JSON.stringify({ review_id }) }] };
    }
  );
}
```

`mcp/src/tools/add-file.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Storage } from "@aros/server/storage.js";

export function registerAddFile(server: McpServer, storage: Storage) {
  server.tool(
    "add_file",
    "Add a file to a review (text or binary via base64)",
    {
      review_id: z.string(),
      filename: z.string().describe("Filename, e.g. hero.svg or draft.md"),
      content: z.string().describe("Raw text content or base64-encoded binary"),
      content_type: z.string().describe("MIME type, e.g. image/svg+xml"),
      encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
    },
    async (params) => {
      try {
        storage.addFile(params.review_id, params.filename, params.content, params.content_type, params.encoding);
        const filePath = `review/${params.review_id}/content/${params.filename}`;
        return { content: [{ type: "text", text: JSON.stringify({ ok: true, path: filePath }) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    }
  );
}
```

`mcp/src/tools/submit-for-review.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Storage } from "@aros/server/storage.js";
import type { PipelineEngine } from "@aros/server/pipeline/engine.js";

export function registerSubmitForReview(server: McpServer, storage: Storage, engine: PipelineEngine) {
  server.tool(
    "submit_for_review",
    "Finalize submission and enter the review pipeline",
    { review_id: z.string() },
    async (params) => {
      try {
        const result = await engine.submit(params.review_id);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    }
  );
}
```

`mcp/src/tools/check-status.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Storage } from "@aros/server/storage.js";

export function registerCheckStatus(server: McpServer, storage: Storage) {
  server.tool(
    "check_status",
    "Check where a deliverable is in the pipeline",
    { review_id: z.string() },
    async (params) => {
      try {
        const status = storage.readStatus(params.review_id);
        return { content: [{ type: "text", text: JSON.stringify(status) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    }
  );
}
```

`mcp/src/tools/get-feedback.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Storage } from "@aros/server/storage.js";

export function registerGetFeedback(server: McpServer, storage: Storage) {
  server.tool(
    "get_feedback",
    "Read structured feedback when revision is requested",
    { review_id: z.string() },
    async (params) => {
      try {
        const feedback = storage.readFeedback(params.review_id);
        if (!feedback) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "No feedback available" }) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(feedback) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    }
  );
}
```

`mcp/src/tools/list-my-reviews.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Storage } from "@aros/server/storage.js";

export function registerListMyReviews(server: McpServer, storage: Storage) {
  server.tool(
    "list_my_reviews",
    "List all reviews submitted by this agent",
    {
      source_agent: z.string(),
      stage: z.enum(["draft", "objective", "subjective", "human", "approved", "rejected", "revision_requested"]).optional().describe("Filter by stage"),
    },
    async (params) => {
      const reviews = storage.listReviews({
        source_agent: params.source_agent,
        stage: params.stage,
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            reviews: reviews.map((r) => ({
              review_id: r.id,
              title: r.title,
              stage: r.stage,
              score: r.score,
              submitted_at: r.submitted_at,
            })),
          }),
        }],
      };
    }
  );
}
```

`mcp/src/tools/read-file.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Storage } from "@aros/server/storage.js";

export function registerReadFile(server: McpServer, storage: Storage) {
  server.tool(
    "read_file",
    "Read back a submitted file's content",
    {
      review_id: z.string(),
      filename: z.string(),
    },
    async (params) => {
      try {
        const { content, encoding } = storage.readFile(params.review_id, params.filename);
        const files = storage.listFiles(params.review_id);
        const file = files.find((f) => f.filename === params.filename);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              content,
              content_type: file?.content_type || "application/octet-stream",
              encoding,
            }),
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    }
  );
}
```

`mcp/src/tools/submit-revision.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Storage } from "@aros/server/storage.js";

export function registerSubmitRevision(server: McpServer, storage: Storage) {
  server.tool(
    "submit_revision",
    "Replace a file during a revision cycle",
    {
      review_id: z.string(),
      filename: z.string(),
      content: z.string(),
      content_type: z.string(),
      encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
    },
    async (params) => {
      try {
        const status = storage.readStatus(params.review_id);
        if (status.stage !== "revision_requested") {
          return { content: [{ type: "text", text: JSON.stringify({ error: `Cannot revise: status is ${status.stage}` }) }], isError: true };
        }
        // Save ONLY the specific file being replaced to history/v{N}/
        // (not the entire content dir — agent may revise multiple files)
        storage.saveFileToHistory(params.review_id, params.filename, status.revision_number + 1);
        storage.addFile(params.review_id, params.filename, params.content, params.content_type, params.encoding);
        return { content: [{ type: "text", text: JSON.stringify({ ok: true }) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    }
  );
}
```

`mcp/src/tools/complete-revision.ts`:

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Storage } from "@aros/server/storage.js";
import type { PipelineEngine } from "@aros/server/pipeline/engine.js";

export function registerCompleteRevision(server: McpServer, storage: Storage, engine: PipelineEngine) {
  server.tool(
    "complete_revision",
    "Finalize revision and re-enter the pipeline",
    { review_id: z.string() },
    async (params) => {
      try {
        const result = await engine.completeRevision(params.review_id);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err) {
        return { content: [{ type: "text", text: JSON.stringify({ error: String(err) }) }], isError: true };
      }
    }
  );
}
```

`mcp/src/tools/list-policies.ts`:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Storage } from "@aros/server/storage.js";

export function registerListPolicies(server: McpServer, storage: Storage) {
  server.tool(
    "list_policies",
    "List available review policies",
    {},
    async () => {
      const policies = storage.listPolicies();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            policies: policies.map((p) => ({
              name: p.name,
              stages: p.stages,
              max_revisions: p.max_revisions,
            })),
          }),
        }],
      };
    }
  );
}
```

- [ ] **Step 4: Verify MCP package compiles**

```bash
pnpm --filter @aros/mcp build
```

Note: The MCP server imports from `@aros/server`. The server package needs to export Storage, PipelineEngine, etc. from its `src/index.ts`. The server `package.json` `main` field should point to `dist/index.js`. Adjust imports if the build fails — the MCP may need to import from specific file paths rather than the package root, depending on how exports are configured.

If direct imports like `@aros/server/storage.js` don't work, add an `exports` field to `server/package.json`:

```json
"exports": {
  ".": "./dist/index.js",
  "./storage.js": "./dist/storage.js",
  "./pipeline/engine.js": "./dist/pipeline/engine.js",
  "./notifications/driver.js": "./dist/notifications/driver.js",
  "./notifications/paperclip.js": "./dist/notifications/paperclip.js"
}
```

- [ ] **Step 5: Commit**

```bash
git add mcp/
git commit -m "feat(mcp): add MCP server with all 10 tools"
```

---

## Chunk 5: CLI Entry Point

### Task 9: CLI — `npx aros`

**Files:**
- Create: `cli/src/index.ts`
- Create: `cli/src/init.ts`
- Create: `cli/src/serve.ts`

- [ ] **Step 1: Create init module**

`cli/src/init.ts`:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import * as prompts from "@clack/prompts";
import { Storage } from "@aros/server";

export async function initProject(): Promise<string> {
  prompts.intro("Welcome to AROS — Agent Review Orchestration Service");

  const dirResult = await prompts.text({
    message: "Project directory?",
    initialValue: "./aros",
    validate: (val) => (val.trim() ? undefined : "Directory is required"),
  });

  if (prompts.isCancel(dirResult)) {
    prompts.cancel("Setup cancelled.");
    process.exit(0);
  }

  const projectDir = path.resolve(dirResult as string);
  const storage = new Storage(projectDir);
  storage.init();

  prompts.log.success(`Created project at ${projectDir}`);
  return projectDir;
}
```

- [ ] **Step 2: Create serve module**

`cli/src/serve.ts`:

```typescript
import * as path from "node:path";
import { createServer } from "@aros/server";

export async function serve(projectDir: string) {
  // Look for built dashboard relative to this package
  const dashboardDir = findDashboardDist();

  const server = createServer({
    projectDir,
    dashboardDir,
  });

  await server.start();

  console.log(`  ● AROS serving ${projectDir}`);
  console.log(`  ● Dashboard:   http://localhost:${server.port}`);
  console.log(`  ● MCP command:  npx aros mcp --project ${projectDir}`);

  // Handle shutdown
  process.on("SIGINT", () => {
    server.stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    server.stop();
    process.exit(0);
  });
}

function findDashboardDist(): string | undefined {
  // Try several locations relative to cli package
  const here = new URL(".", import.meta.url).pathname;
  const candidates = [
    path.resolve(here, "../../dashboard/dist"),
    path.resolve(here, "../../../dashboard/dist"),
  ];
  for (const dir of candidates) {
    try {
      const fs = require("node:fs");
      if (fs.existsSync(path.join(dir, "index.html"))) return dir;
    } catch { /* ignore */ }
  }
  return undefined;
}
```

- [ ] **Step 3: Create CLI entry point**

`cli/src/index.ts`:

```typescript
#!/usr/bin/env node
import { Command } from "commander";
import { Storage } from "@aros/server";
import { initProject } from "./init.js";
import { serve } from "./serve.js";

const program = new Command();

program
  .name("aros")
  .description("AROS — Agent Review Orchestration Service")
  .version("0.1.0");

// Default command: init (if needed) + serve
program
  .argument("[project]", "Project directory")
  .action(async (projectArg?: string) => {
    let projectDir: string;

    if (projectArg) {
      projectDir = require("node:path").resolve(projectArg);
    } else {
      // Check if current dir or ./aros is initialized
      const candidates = [process.cwd(), require("node:path").resolve("./aros")];
      const existing = candidates.find((d) => new Storage(d).isInitialized());
      if (existing) {
        projectDir = existing;
      } else {
        projectDir = await initProject();
      }
    }

    const storage = new Storage(projectDir);
    if (!storage.isInitialized()) {
      storage.init();
    }

    await serve(projectDir);
  });

// MCP subcommand: used by agents via STDIO transport.
// This must yield stdin/stdout cleanly to the child process.
program
  .command("mcp")
  .description("Start MCP server (STDIO transport)")
  .requiredOption("--project <dir>", "Project directory")
  .action(async (opts) => {
    const { spawn } = await import("node:child_process");
    const mcpEntry = require.resolve("@aros/mcp");
    const child = spawn("node", [mcpEntry, "--project", opts.project], {
      stdio: "inherit",  // Pass stdin/stdout through for JSON-RPC
    });
    child.on("exit", (code) => process.exit(code ?? 0));
  });

program.parse();
```

- [ ] **Step 4: Build CLI and verify**

```bash
pnpm -r build
```

- [ ] **Step 5: Commit**

```bash
git add cli/src/
git commit -m "feat(cli): add npx aros entry point with init + serve + mcp subcommand"
```

---

## Chunk 6: Dashboard Updates + Integration Test

### Task 10: Dashboard — Connect to Real API

Update types, simplify Policy type for MVP, and ensure components work with real API responses.

**Files:**
- Modify: `dashboard/src/lib/api/types.ts`
- Modify: `dashboard/src/lib/api/client.ts`
- Modify: `dashboard/.env.example`
- Modify: `dashboard/src/components/policies/policy-editor.tsx` (simplify for MVP)

- [ ] **Step 1: Update Stage type and FeedbackIssue**

In `dashboard/src/lib/api/types.ts`:

1. Replace Stage type — remove `"inbox"` and `"auto_approved"`, add `"draft"`:
```typescript
export type Stage =
  | "draft"
  | "objective"
  | "subjective"
  | "human"
  | "revision_requested"
  | "approved"
  | "rejected";
```

2. Add `file: string | null;` to `FeedbackIssue` interface.

3. Add `size_bytes: number;` to `DeliverableFile` interface.

4. Simplify `Policy` type for MVP — the server returns `PolicyConfig` shape. Make the rich fields optional so components degrade gracefully:
```typescript
export interface Policy extends PolicySummary {
  objective?: {
    checks: PolicyObjectiveCheck[];
    fail_threshold: number;
  };
  subjective?: {
    evaluation_model?: string;  // Optional for MVP
    criteria: PolicySubjectiveCriterion[];
    pass_threshold: number;
    require_rationale?: boolean;  // Optional for MVP
  };
  human?: { required: boolean } | PolicyHumanConfig;
  revision_handling?: {  // Optional for MVP
    mode: "auto_revise" | "hybrid" | "manual";
    max_auto_revisions?: number;
    escalate_after_auto_fail?: boolean;
  };
  default_notifications?: Array<{
    driver: string;
    target: Record<string, unknown>;
    events: string[];
  }>;
  raw_json?: string;  // Optional for MVP
}
```

- [ ] **Step 2: Update .env.example**

```
VITE_AROS_API_URL=http://localhost:4100/api
```

- [ ] **Step 3: Guard policy editor against missing fields**

In `dashboard/src/components/policies/policy-editor.tsx`, add optional chaining for MVP-simplified fields. Wrap any references to `policy.revision_handling`, `policy.human.assignment_strategy`, `policy.human.sla_hours`, etc. in optional chaining (`?.`) or conditional rendering (`{policy.revision_handling && ...}`). The policy editor is read-only for MVP per spec Section 13, so these fields just need to not crash.

- [ ] **Step 4: Verify dashboard still builds**

```bash
pnpm --filter dashboard build
```

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/api/types.ts dashboard/.env.example dashboard/src/components/policies/
git commit -m "feat(dashboard): update types and simplify Policy for real API integration"
```

---

### Task 11: End-to-End Smoke Test

Manual integration test that verifies the full pipeline.

**Files:**
- Create: `scripts/smoke-test.sh`

- [ ] **Step 1: Write smoke test script**

`scripts/smoke-test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

AROS_DIR=$(mktemp -d)
PORT=4100  # Matches .aros.json default
API="http://localhost:$PORT/api"

echo "=== AROS Smoke Test ==="
echo "Project dir: $AROS_DIR"

# Initialize project
node cli/dist/index.js "$AROS_DIR" &
AROS_PID=$!
sleep 2

# Check server is running
curl -sf "$API/pipeline/counts" > /dev/null || { echo "FAIL: server not responding"; kill $AROS_PID; exit 1; }
echo "✓ Server running"

# Check policies endpoint
POLICIES=$(curl -sf "$API/policies")
echo "$POLICIES" | grep -q "default" || { echo "FAIL: default policy missing"; kill $AROS_PID; exit 1; }
echo "✓ Default policy exists"

# Create a review via MCP (simulate by calling storage directly via API)
# For now, test the REST API endpoints
DELIVERABLES=$(curl -sf "$API/deliverables")
echo "✓ Deliverables endpoint works (${#DELIVERABLES} bytes)"

COUNTS=$(curl -sf "$API/pipeline/counts")
echo "✓ Pipeline counts: $COUNTS"

# Cleanup
kill $AROS_PID 2>/dev/null || true
rm -rf "$AROS_DIR"

echo ""
echo "=== All smoke tests passed ==="
```

- [ ] **Step 2: Make executable and run**

```bash
chmod +x scripts/smoke-test.sh
pnpm -r build
./scripts/smoke-test.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke-test.sh
git commit -m "test: add end-to-end smoke test script"
```

---

## Chunk 7: Build & Polish

### Task 12: Update .gitignore and Root Config

**Files:**
- Modify: `.gitignore`
- Create: `server/vitest.config.ts`

- [ ] **Step 1: Update .gitignore**

Add to `.gitignore`:

```
node_modules/
dist/
*.tsbuildinfo
.env
```

- [ ] **Step 2: Add vitest config to server**

`server/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Final build check**

```bash
pnpm install
pnpm -r build
pnpm --filter @aros/server test
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore server/vitest.config.ts
git commit -m "chore: update gitignore and add vitest config"
```

---

## Summary

| Task | Component | Dependencies |
|------|-----------|-------------|
| 1 | Monorepo scaffolding + shared types | None |
| 2 | Filesystem storage layer | Task 1 |
| 3 | Objective stage checks | Task 2 |
| 4 | Subjective stage (Claude API) | Task 2 |
| 5 | Pipeline engine (state machine) | Tasks 3, 4 |
| 6 | Notification system + Paperclip driver | Task 2 |
| 7 | Express server (REST + SSE) | Tasks 2, 5, 6 |
| 8 | MCP server (10 tools) | Tasks 2, 5 |
| 9 | CLI entry point | Tasks 7, 8 |
| 10 | Dashboard type updates | Task 7 |
| 11 | End-to-end smoke test | Tasks 7, 9 |
| 12 | Build polish + gitignore | All |

**Parallelization:** Tasks 3, 4, and 6 can run in parallel (all depend only on Task 2). Tasks 7 and 8 can run in parallel (both depend on Task 5). Task 10 can run in parallel with Tasks 8 and 9.
