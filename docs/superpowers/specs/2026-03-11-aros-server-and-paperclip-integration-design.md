# AROS Server & Paperclip Integration — Design Spec

**Date:** 2026-03-11
**Status:** Approved

---

## 1. Overview

Build the AROS backend server and MCP service so that AI agents (orchestrated by Paperclip) can submit deliverables for multi-stage review, receive structured feedback, revise, and get approval — all visible in real-time through the AROS dashboard.

**End-to-end flow:** Paperclip CEO agent creates images → submits via AROS MCP → objective + subjective + human review pipeline → dashboard shows deliverables → human requests revisions → agent revises → human approves → Paperclip issue marked done.

**Deviation from PRD:** The original PRD specified reusing `@modelcontextprotocol/server-filesystem`'s 14-tool interface (e.g. `write_file` to `inbox/`, `read_text_file` on `status.json`). This design replaces that with 10 purpose-built MCP tools (`create_review`, `add_file`, `submit_for_review`, etc.). Purpose-built tools are more discoverable by AI agents, enforce validation via Zod schemas at the protocol level, produce cleaner agent prompts, and eliminate the brittle convention of overloading filesystem paths to encode review pipeline semantics.

---

## 2. Package Structure

pnpm monorepo published as a single `aros` npm package. Users run `npx aros`.

```
aros/
├── pnpm-workspace.yaml
├── package.json                     # Root workspace
├── cli/                             # Published as "aros" on npm
│   ├── package.json                 # name: "aros", bin: { aros: "./dist/index.js" }
│   └── src/
│       └── index.ts                 # Single entry — init + serve
├── server/                          # Express REST API + pipeline engine
│   ├── package.json
│   └── src/
│       ├── index.ts                 # Express app factory
│       ├── routes/
│       │   ├── deliverables.ts      # CRUD + decision endpoint
│       │   ├── policies.ts          # Policy CRUD
│       │   ├── pipeline.ts          # Pipeline counts
│       │   └── files.ts             # Serve deliverable files (images, etc.)
│       ├── sse.ts                   # SSE event emitter (chokidar file watcher)
│       ├── pipeline/
│       │   ├── engine.ts            # State machine — advances deliverables through stages
│       │   ├── objective.ts         # Automated checks (file size, format, word count, etc.)
│       │   └── subjective.ts        # Claude API call for AI review
│       ├── storage.ts               # Filesystem read/write abstraction
│       └── notifications/
│           ├── driver.ts            # NotificationDriver interface
│           └── paperclip.ts         # Paperclip REST API driver
├── mcp/                             # MCP server (STDIO transport)
│   ├── package.json
│   └── src/
│       ├── index.ts                 # MCP server entry (spawned per agent session)
│       └── tools/
│           ├── create-review.ts
│           ├── add-file.ts
│           ├── submit-for-review.ts
│           ├── check-status.ts
│           ├── get-feedback.ts
│           ├── list-my-reviews.ts
│           ├── read-file.ts
│           ├── submit-revision.ts
│           ├── complete-revision.ts
│           └── list-policies.ts
├── dashboard/                       # Already built (Vite + React)
│   └── ...                          # Existing frontend code
└── packages/
    └── types/                       # Shared TypeScript types
        ├── package.json
        └── src/
            └── index.ts             # Deliverable, Policy, Feedback, etc.
```

---

## 3. CLI: `npx aros`

Single command. Uses `@clack/prompts` for first-time setup, then starts servers.

**First run (no project folder detected):**

```
$ npx aros

  ◆ Welcome to AROS — Agent Review Orchestration Service
  │
  ◇ Project directory?
  │  ./aros
  │
  ◆ Created project at ./aros
  │
  ● Dashboard:   http://localhost:4100
  ● MCP command:  npx aros mcp --project ./aros
```

**Subsequent runs:**

```
$ npx aros

  ● AROS serving ./aros
  ● Dashboard:   http://localhost:4100
  ● MCP command:  npx aros mcp --project ./aros
```

**What `init` creates:**

```
{project}/
├── policies/
│   └── default.json            # Standard 3-stage policy
├── review/                     # Active deliverables
├── approved/                   # Terminal: approved
├── rejected/                   # Terminal: rejected
└── .aros.json                  # Project config (port, etc.)
```

**`policies/default.json`:**
```json
{
  "name": "default",
  "stages": ["objective", "subjective", "human"],
  "max_revisions": 3,
  "objective": {
    "checks": [
      { "name": "file_size", "max_mb": 10, "severity": "blocking" },
      { "name": "format_check", "allowed": ["image/*", "text/*", "application/pdf"], "severity": "blocking" }
    ],
    "fail_threshold": 1
  },
  "subjective": {
    "criteria": [
      { "name": "relevance", "description": "How well does the deliverable match the brief?", "weight": 3 },
      { "name": "quality", "description": "Overall production quality", "weight": 2 },
      { "name": "clarity", "description": "Is the message clear and effective?", "weight": 1 }
    ],
    "pass_threshold": 6.0
  },
  "human": {
    "required": true
  }
}
```

**`.aros.json`:**
```json
{
  "version": 1,
  "port": 4100,
  "subjective_model": "claude-sonnet-4-20250514"
}
```

**MCP for agents** — agents spawn a separate STDIO process:
```json
{
  "mcpServers": {
    "aros": {
      "command": "npx",
      "args": ["aros", "mcp", "--project", "./aros"]
    }
  }
}
```

The MCP process reads/writes the same filesystem directory as the HTTP server. Both processes share storage via the filesystem.

---

## 4. MCP Tool Contract

10 tools. STDIO transport. Built with `@modelcontextprotocol/sdk` + Zod schemas.

### 4.1 Submission Tools

**`create_review`** — Start a new review, returns a review_id.

```typescript
// Input
{
  title: z.string().describe("Human-readable title for the deliverable"),
  brief: z.string().describe("Production instructions — what was asked for"),
  policy: z.string().default("default").describe("Review policy name"),
  source_agent: z.string().describe("ID of the agent submitting"),
  content_type: z.string().default("text/markdown").describe("Primary MIME type"),
  folder_strategy: z.enum(["all_pass", "select", "rank", "categorize"]).optional()
    .describe("For multi-file: how files aggregate into a decision"),
  notification: z.object({
    driver: z.string().describe("Notification driver name, e.g. 'paperclip'"),
    target: z.record(z.unknown()).describe("Driver-specific config"),
    events: z.array(z.string()).describe("Events to notify on")
  }).optional().describe("Callback config for pipeline decisions — validated immediately via driver.validateTarget()")
}

// Output
{ review_id: string }
```

Annotations: `destructiveHint: false`, `idempotentHint: false`

**`add_file`** — Add a file to a review (text or binary via base64).

```typescript
// Input
{
  review_id: z.string(),
  filename: z.string().describe("Filename, e.g. hero.svg or draft.md"),
  content: z.string().describe("Raw text content or base64-encoded binary"),
  content_type: z.string().describe("MIME type, e.g. image/svg+xml"),
  encoding: z.enum(["utf-8", "base64"]).default("utf-8")
}

// Output
{ ok: true, path: string }
```

Annotations: `destructiveHint: true` (overwrites if filename exists)

**`submit_for_review`** — Finalize submission and enter the review pipeline.

```typescript
// Input
{ review_id: z.string() }

// Output
{ stage: string, message: string }
```

Triggers the pipeline engine. Returns the first stage entered (usually `objective`).

Annotations: `destructiveHint: false`, `idempotentHint: false`

### 4.2 Status & Feedback Tools

**`check_status`** — Check where a deliverable is in the pipeline.

```typescript
// Input
{ review_id: z.string() }

// Output
{
  stage: string,          // "draft" | "objective" | "subjective" | "human" | "approved" | "rejected" | "revision_requested"
  score: number | null,
  entered_stage_at: string,
  revision_number: number,
  submitted_at: string
}
```

Annotations: `readOnlyHint: true`

**`get_feedback`** — Read structured feedback when revision is requested.

```typescript
// Input
{ review_id: z.string() }

// Output
{
  decision: string,       // "revision_requested" | "rejected"
  summary: string,
  issues: Array<{
    file: string | null,  // null for single-file deliverables
    category: string,
    severity: "critical" | "major" | "minor",
    description: string,
    suggestion: string
  }>,
  reviewer: string,       // "aros-objective", "aros-subjective", or human reviewer name
  timestamp: string
}
```

Annotations: `readOnlyHint: true`

**`list_my_reviews`** — List all reviews submitted by this agent.

```typescript
// Input
{
  source_agent: z.string(),
  stage: z.string().optional().describe("Filter by stage")
}

// Output
{
  reviews: Array<{
    review_id: string,
    title: string,
    stage: string,
    score: number | null,
    submitted_at: string
  }>
}
```

Annotations: `readOnlyHint: true`

**`read_file`** — Read back a submitted file's content.

```typescript
// Input
{
  review_id: z.string(),
  filename: z.string()
}

// Output
{
  content: string,        // Raw text or base64
  content_type: string,
  encoding: "utf-8" | "base64"
}
```

Annotations: `readOnlyHint: true`

### 4.3 Revision Tools

**`submit_revision`** — Replace a file during a revision cycle.

```typescript
// Input
{
  review_id: z.string(),
  filename: z.string(),
  content: z.string(),
  content_type: z.string(),
  encoding: z.enum(["utf-8", "base64"]).default("utf-8")
}

// Output
{ ok: true }
```

Only allowed when status is `revision_requested`. Saves previous version to `history/v{N}/`.

Annotations: `destructiveHint: true`

**`complete_revision`** — Finalize revision and re-enter the pipeline.

```typescript
// Input
{ review_id: z.string() }

// Output
{ stage: string, message: string }
```

Re-enters the pipeline at the stage that requested the revision (not from scratch).

Annotations: `destructiveHint: false`, `idempotentHint: false`

### 4.4 Discovery Tools

**`list_policies`** — List available review policies.

```typescript
// Input: (none)

// Output
{
  policies: Array<{
    name: string,
    stages: string[],
    max_revisions: number
  }>
}
```

Annotations: `readOnlyHint: true`

---

## 5. Review Pipeline Engine

### 5.1 State Machine

```
create_review → [draft]
submit_for_review → [objective] → [subjective] → [human] → [approved]
                        ↓              ↓            ↓
                   [revision_requested] ←───────────┘
                        ↓
                   (agent revises)
                        ↓
                   complete_revision → re-enters at rejecting stage

                   [rejected] (terminal, from human stage only)
```

Stages can be skipped per policy config. A policy with `stages: ["objective", "human"]` skips subjective.

### 5.2 Objective Stage

Runs automated checks defined in the policy. Executes synchronously on `submit_for_review`.

**Built-in checks:**

| Check | Applies to | What it does |
|-------|-----------|--------------|
| `file_size` | all | Validates files are under `max_mb` |
| `format_check` | all | Validates MIME type against `allowed` list |
| `image_dimensions` | images | Checks width/height if detectable (SVG viewBox, PNG header) |
| `word_count` | text | Validates word count within `min`/`max` range |
| `profanity_check` | text | Scans for profanity |

Each check returns `{ name, passed, severity, details }`. If any `blocking` check fails beyond the policy's `fail_threshold`, the deliverable goes to `revision_requested` with structured feedback.

### 5.3 Subjective Stage

Makes a Claude API call to evaluate the deliverable against policy criteria.

**Prompt construction:**
- System: "You are a quality reviewer evaluating deliverables against specific criteria."
- Includes: deliverable content (text or base64 images for vision), the brief, and evaluation criteria from the policy
- Asks for: per-criterion scores (0-10), weights, and rationale
- Parses structured JSON response

**Requirements:**
- `ANTHROPIC_API_KEY` environment variable must be set
- If not set, stage is skipped with a warning logged
- Model configurable via `.aros.json` (default: `claude-sonnet-4-20250514`)

Result stored in `subjective_results.json`. If the stage is skipped (no API key), `subjective_results.json` is written with `{ "skipped": true, "reason": "ANTHROPIC_API_KEY not set" }` so the dashboard can distinguish "skipped" from "hasn't run yet". If weighted score is below policy's `pass_threshold`, goes to `revision_requested`.

### 5.4 Human Stage

Deliverable enters the dashboard queue. No automated processing — waits for human action.

**Dashboard decision endpoint:** `POST /api/deliverables/:id/decision`
```json
{
  "decision": "approved" | "revision_requested" | "rejected",
  "reason": "Optional reviewer comment"
}
```

On decision:
1. Writes `feedback.json` (for revise/reject)
2. Updates `status.json`
3. Fires SSE event
4. Fires notification (Paperclip driver)
5. If approved: copies content to `approved/{review_id}/`
6. If rejected: moves to `rejected/{review_id}/`
7. If revision_requested: deliverable stays in `review/`, status updated

### 5.5 Revision Flow

When a deliverable is in `revision_requested`:
1. Agent calls `get_feedback` to read what needs to change
2. Agent calls `submit_revision` for each file that needs updating
   - Previous version saved to `history/v{N}/{filename}`
   - `revision_number` incremented in `status.json`
3. Agent calls `complete_revision`
   - Pipeline re-enters at the stage that rejected it
   - If objective rejected → re-runs from objective
   - If subjective rejected → re-runs from subjective
   - If human rejected → re-enters human queue
4. Max revisions enforced per policy (`max_revisions`). Exceeding → auto-reject.

---

## 6. Filesystem Storage Layout

All state lives on disk. No database.

```
{project}/
├── .aros.json                           # Project config
├── policies/
│   ├── default.json                     # 3-stage standard policy
│   └── ad-creative-review.json          # Image-specific policy
├── review/
│   └── {review_id}/
│       ├── meta.json                    # title, brief, policy, source_agent, notification, content_type
│       ├── status.json                  # stage, score, revision_number, entered_stage_at, submitted_at, rejecting_stage
│       ├── content/
│       │   ├── hero.svg                 # Actual files
│       │   ├── social.svg
│       │   └── banner.svg
│       ├── objective_results.json       # Automated check outputs
│       ├── subjective_results.json      # AI review scores
│       ├── feedback.json                # Structured feedback (on revise/reject)
│       └── history/
│           └── v1/
│               └── hero.svg             # Previous version of revised files
├── approved/
│   └── {review_id}/                     # Approved deliverables (content copied here)
│       ├── meta.json
│       └── content/
│           └── ...
└── rejected/
    └── {review_id}/                     # Rejected deliverables (moved here)
        ├── meta.json
        ├── feedback.json
        └── content/
            └── ...
```

**`meta.json` example:**
```json
{
  "title": "PaperclipAI Q2 Launch Campaign",
  "brief": "Create 3 ad creatives for the Q2 launch...",
  "policy": "ad-creative-review",
  "source_agent": "ceo-agent",
  "content_type": "image/svg+xml",
  "folder_strategy": "all_pass",
  "notification": {
    "driver": "paperclip",
    "target": {
      "api_url": "http://localhost:3100",
      "company_id": "comp-001",
      "issue_id": "ISS-123",
      "agent_id": "agent-ceo"
    },
    "events": ["approved", "revision_requested", "rejected"]
  }
}
```

**`status.json` example:**
```json
{
  "stage": "human",
  "score": 8.2,
  "revision_number": 1,
  "entered_stage_at": "2026-03-11T10:30:00Z",
  "submitted_at": "2026-03-11T10:00:00Z",
  "rejecting_stage": null
}
```

**Review ID format:** `d-{YYYYMMDD}-{NNN}` (date-based, incrementing counter per day). The counter is derived by scanning existing `review/` directories for the current date prefix and incrementing. No separate counter file.

**Concurrency note:** The filesystem is the shared state mechanism between the MCP process and the HTTP server. MVP assumes low contention (single reviewer, one agent at a time). Status transitions should read `status.json`, verify the current stage is still valid (optimistic check), then write — to prevent the rare case where an MCP revision and a dashboard decision race.

---

## 7. REST API (Dashboard)

Express server on port 4100. Serves both the API and the built dashboard static files.

### 7.1 Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/deliverables` | List deliverables. `?stage=human` filter. |
| `GET` | `/api/deliverables/:id` | Full deliverable (meta + status + results + files list) |
| `GET` | `/api/deliverables/:id/files/:filename` | Serve file content with correct MIME/Content-Type |
| `POST` | `/api/deliverables/:id/decision` | Submit human review decision |
| `GET` | `/api/pipeline/counts` | Count deliverables per stage |
| `GET` | `/api/policies` | List policies |
| `GET` | `/api/policies/:name` | Get single policy |
| `PUT` | `/api/policies/:name` | Update policy |
| `DELETE` | `/api/policies/:name` | Delete policy |
| `GET` | `/api/events` | SSE stream |

### 7.2 SSE Events

Uses `chokidar` to watch the `review/` directory for filesystem changes. Emits:

| Event | When | Data |
|-------|------|------|
| `deliverable:submitted` | New deliverable enters pipeline | `{ id, title, stage }` |
| `deliverable:stage_changed` | Deliverable advances/regresses | `{ id, title, old_stage, new_stage, score }` |
| `deliverable:decided` | Human makes decision | `{ id, decision }` |
| `deliverable:revised` | Agent submits revision | `{ id, revision_number }` |

### 7.3 File Serving

`GET /api/deliverables/:id/files/:filename` serves files from `review/{id}/content/{filename}` (also checks `approved/{id}/content/` and `rejected/{id}/content/` for terminal-state deliverables) with:
- Correct `Content-Type` header from MIME type
- `Cache-Control: no-cache` (content can change on revision)
- For images: serves binary directly (browser renders natively)
- For text: serves as `text/plain` or the declared content type

The dashboard's `ImageCard` uses this URL to render real images:
```
<img src="http://localhost:4100/api/deliverables/d-20260311-007/files/hero.svg" />
```

---

## 8. Notification System

### 8.1 Driver Interface

```typescript
interface NotificationDriver {
  name: string;
  /** Validates target config at submission time — fail fast on misconfiguration. */
  validateTarget(target: Record<string, unknown>): { valid: boolean; error?: string };
  /** Sends a notification. Returns result for logging/retry. */
  send(
    event: "approved" | "revision_requested" | "rejected",
    deliverable: { review_id: string; title: string; revision_number: number },
    feedback: Feedback | null,
    target: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }>;
}
```

### 8.2 Paperclip Driver

Calls Paperclip REST API to post comments and update issue status.

**On `revision_requested`:**
```
POST {api_url}/api/companies/{company_id}/issues/{issue_id}/comments
{
  "content": "## Revision Requested\n\n{summary}\n\n### Issues\n{formatted issues}",
  "authorAgentId": null  // system comment
}
```

**On `approved`:**
```
POST {api_url}/api/companies/{company_id}/issues/{issue_id}/comments
{ "content": "## Approved\n\nDeliverable approved by human reviewer." }

PATCH {api_url}/api/companies/{company_id}/issues/{issue_id}
{ "status": "done" }
```

**On `rejected`:**
```
POST {api_url}/api/companies/{company_id}/issues/{issue_id}/comments
{ "content": "## Rejected\n\n{summary}\n\n### Issues\n{formatted issues}" }

PATCH {api_url}/api/companies/{company_id}/issues/{issue_id}
{ "status": "blocked" }
```

---

## 9. Dashboard Changes

Minimal changes to the existing dashboard:

1. **Remove mock data fallback** — when `VITE_AROS_API_URL` is set, use real API only
2. **API URL convention** — Express mounts all routes under `/api/` (e.g. `/api/deliverables`). The dashboard's `VITE_AROS_API_URL` should be set to `http://localhost:4100/api` so that `fetchJson("/deliverables")` resolves correctly. In production (served by Express), use a relative path or proxy.
3. **Image rendering** — `ImageCard` and `SingleImageView` use file URLs from the API. The server populates `preview_url` in the `GET /api/deliverables/:id` response as `${baseUrl}/deliverables/${id}/files/${filename}` for each file in the files array. This preserves the existing `DeliverableFile.preview_url` field the components already use.
4. **Update `Stage` type** — Remove `"inbox"` and `"auto_approved"` from the `Stage` union. Add `"draft"`. Final type: `"draft" | "objective" | "subjective" | "human" | "approved" | "rejected" | "revision_requested"`.
5. **SSE event format** — SSE events are sent as `data:` messages with a JSON payload containing a `type` field (e.g. `{ "type": "deliverable:submitted", "data": {...} }`). This matches the existing SSE client pattern at `sse.ts:52`.
6. **SSE reconnect** — already implemented, just needs real server
7. **Decision bar** — already calls `POST /deliverables/:id/decision`, works as-is

The dashboard is **served by the Express server** in production (static files from `dashboard/dist/`). During development, Vite dev server proxies API calls to Express.

---

## 10. Paperclip Integration Setup

### 10.1 Prerequisites

- Paperclip running locally (`npx paperclipai`)
- Company created with CEO agent
- AROS running (`npx aros`)

### 10.2 CEO Agent MCP Configuration

The CEO agent's adapter config includes AROS as an MCP server:

```json
{
  "mcpServers": {
    "aros": {
      "command": "npx",
      "args": ["aros", "mcp", "--project", "/path/to/aros-project"]
    }
  }
}
```

### 10.3 CEO Agent Prompt Template

The CEO agent's system prompt should include instructions for using AROS:

```
When you produce deliverables (documents, images, plans, creative assets):
1. Call create_review with a descriptive title, the original brief, and your agent ID
2. Call add_file for each file you've created
3. Call submit_for_review to send it through the review pipeline
4. Periodically check_status on your submissions
5. If revision is requested, call get_feedback, make changes, then submit_revision + complete_revision
```

### 10.4 Creating the Task

```bash
# Via Paperclip API
POST http://localhost:3100/api/companies/{companyId}/issues
{
  "title": "Create 3 ad images for PaperclipAI Q2 2026 launch campaign",
  "description": "Design 3 ad creative images: a hero image, a social media variant, and an enterprise banner. Use dark backgrounds with modern tech aesthetic. Submit via AROS for review.",
  "priority": "high",
  "assigneeAgentId": "{ceoAgentId}"
}
```

### 10.5 Full Lifecycle

```
1. npx aros                    # Start AROS server + dashboard
2. npx paperclipai             # Start Paperclip (separate terminal)
3. Create issue via Paperclip API (or UI)
4. Paperclip triggers CEO heartbeat
5. CEO agent: create_review → add_file x3 → submit_for_review
6. AROS: objective checks → subjective AI review → human queue
7. Dashboard: human reviews images, clicks "Revise" with feedback
8. AROS: fires Paperclip notification → comment posted on issue
9. Next CEO heartbeat: reads feedback, revises, resubmits
10. Dashboard: human approves
11. AROS: fires Paperclip notification → issue marked done
```

---

## 11. Technology Stack

| Component | Technology |
|-----------|-----------|
| CLI | Commander.js + @clack/prompts |
| Server | Express.js |
| MCP | @modelcontextprotocol/sdk (STDIO transport) |
| Schema validation | Zod v4 |
| File watching | chokidar |
| AI review | Anthropic SDK (@anthropic-ai/sdk) |
| Dashboard | Vite + React 19 + Tailwind (already built) |
| Build | esbuild (CLI + server → single-file bundles for fast `npx` cold start) |
| Monorepo | pnpm workspaces |
| Runtime | Node.js >= 20 |

---

## 12. Shared TypeScript Types (`packages/types`)

Shared interfaces imported by both the server and MCP packages:

```typescript
type Stage = "draft" | "objective" | "subjective" | "human"
           | "approved" | "rejected" | "revision_requested";

type FolderStrategy = "all_pass" | "select" | "rank" | "categorize";

interface DeliverableMeta {
  title: string;
  brief: string;
  policy: string;
  source_agent: string;
  content_type: string;
  folder_strategy?: FolderStrategy;
  notification?: NotificationConfig;
}

interface DeliverableStatus {
  stage: Stage;
  score: number | null;
  revision_number: number;
  entered_stage_at: string;
  submitted_at: string;
  rejecting_stage: Stage | null;
}

interface DeliverableFile {
  filename: string;
  content_type: string;
  size_bytes: number;
  preview_url?: string;   // Computed by server in API responses
}

interface Feedback {
  decision: "revision_requested" | "rejected";
  summary: string;
  issues: FeedbackIssue[];
  reviewer: string;
  timestamp: string;
}

interface FeedbackIssue {
  file: string | null;
  category: string;
  severity: "critical" | "major" | "minor";
  description: string;
  suggestion: string;
}

interface NotificationConfig {
  driver: string;
  target: Record<string, unknown>;
  events: string[];
}

interface PolicyConfig {
  name: string;
  stages: Stage[];
  max_revisions: number;
  objective?: ObjectiveConfig;
  subjective?: SubjectiveConfig;
  human?: { required: boolean };
}
```

---

## 13. What's NOT in Scope

- Authentication / multi-user (single reviewer for MVP)
- External database (filesystem only)
- Non-Paperclip notification drivers (webhook, Slack — future)
- Dashboard policy editor saving to filesystem (read-only for MVP, edit JSON files directly)
- Auto-approval rules
- Concurrent reviewer support (single reviewer per deliverable)
- Image analysis in objective checks (format/size only, vision is in subjective stage)
