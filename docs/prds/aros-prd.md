# Agent Review Orchestration Service (AROS)

## Product Requirements Document

**Version:** 1.1
**Date:** March 10, 2026

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Core Concepts](#2-core-concepts)
3. [Architecture](#3-architecture)
   - 3.1 [Filesystem MCP Server Contract](#31-filesystem-mcp-server-contract)
   - 3.2 [Project Directory Structure](#32-project-directory-structure)
   - 3.3 [Tool Mapping to AROS Operations](#33-tool-mapping-to-aros-operations)
   - 3.4 [Review Stage Configurations](#34-review-stage-configurations)
   - 3.5 [Pipeline Execution Flow](#35-pipeline-execution-flow)
   - 3.6 [Feedback Structure](#36-feedback-structure)
4. [Blocking and Lock Enforcement](#4-blocking-and-lock-enforcement)
   - 4.1 [Lock Enforcement Through Filesystem Permissions](#41-lock-enforcement-through-filesystem-permissions)
   - 4.2 [Integration with External Orchestrators](#42-integration-with-external-orchestrators)
5. [Triggering Revisions](#5-triggering-revisions)
6. [Auto-Approval Rules](#6-auto-approval-rules)
7. [Notification System: Native Consumer Integrations](#7-notification-system-native-consumer-integrations)
   - 7.1 [Driver Interface](#71-driver-interface)
   - 7.2 [PaperclipAI Driver (First Implementation)](#72-paperclipai-driver-first-implementation)
   - 7.3 [Planned Drivers](#73-planned-drivers)
   - 7.4 [Driver Configuration](#74-driver-configuration)
   - 7.5 [Driver as Skill](#75-driver-as-skill)
   - 7.6 [Policy-Level Default Notifications](#76-policy-level-default-notifications)
8. [Folders and Multi-Asset Deliverables](#8-folders-and-multi-asset-deliverables)
   - 8.1 [Folder Strategies](#81-folder-strategies)
   - 8.2 [Per-File Policy Overrides](#82-per-file-policy-overrides)
   - 8.3 [Selection and Ranking Pipeline](#83-selection-and-ranking-pipeline)
   - 8.4 [Folder Revisions](#84-folder-revisions)
   - 8.5 [Folder Approval and Output](#85-folder-approval-and-output)
9. [Marketplace for Objective Review Modules](#9-marketplace-for-objective-review-modules)
10. [Tool Installation and Configuration](#10-tool-installation-and-configuration)
11. [Dashboard MVP](#11-dashboard-mvp)
12. [Notifications and Mobile](#12-notifications-and-mobile)
13. [Actions on Decision Outcomes](#13-actions-on-decision-outcomes)
14. [Data Model](#14-data-model)
15. [Key Design Decisions](#15-key-design-decisions)
16. [MVP Implementation Sequence](#16-mvp-implementation-sequence)

---

## 1. Problem Statement

AI-generated content has no structured quality gate between production and use. Output is generated, then either accepted wholesale or manually inspected without systematic criteria. This creates two failure modes: unchecked low-quality output entering production, and bottlenecked human review that negates the speed advantage of AI generation. Neither is acceptable at scale.

AROS is an orchestration layer that enforces a multi-stage review pipeline — automated objective checks, AI-driven subjective evaluation, and human approval — before any deliverable is marked as accepted. It exposes this pipeline as an MCP server implementing the `@modelcontextprotocol/server-filesystem` contract so that any agent or client can submit content, trigger reviews, and retrieve results using filesystem operations they already know.

---

## 2. Core Concepts

**Deliverable**: Any discrete unit of AI-generated content submitted for review. Text document, code file, slide deck, data output, structured report. Format-agnostic at the protocol level.

**Review Pipeline**: An ordered sequence of review stages a deliverable must pass. Each stage has pass/fail/revise outcomes. Failure at any stage halts forward progression and triggers feedback.

**Objective Review**: Automated, deterministic checks. Spelling, grammar, formatting compliance, schema validation, factual consistency against a reference corpus, code linting, word count constraints, structural requirements. Binary pass/fail per check.

**Subjective Review**: AI-agent-driven evaluation against qualitative criteria. Tone, coherence, persuasiveness, alignment with brief, audience appropriateness, logical soundness, originality. Produces a structured score plus written rationale.

**Human Review**: A human reviewer examines the deliverable along with all prior review outputs. They approve, reject with reason, or request specific revisions. This is the terminal gate.

**Revision Cycle**: When any stage returns a revise/reject outcome, the originating agent receives structured feedback and may resubmit. The revision is re-evaluated from the stage that rejected it, not from scratch (unless the revision is substantial enough to warrant full re-review, which is a configurable policy).

**Review Policy**: A named configuration that defines which stages apply, their order, the specific checks or evaluation criteria at each stage, pass thresholds, maximum revision cycles, and escalation rules.

**Notification Driver**: A module that knows how to communicate review status to a specific external system (PaperclipAI, Slack, Linear, GitHub, etc.) in that system's native language and conventions. AROS owns the notification action — consumers do not need adapters.

---

## 3. Architecture

### 3.1 Filesystem MCP Server Contract

AROS implements the same 14-tool interface as `@modelcontextprotocol/server-filesystem` — the reference MCP filesystem server. Agents interact with deliverables, review artifacts, policies, and feedback through filesystem semantics.

Every agent framework, every Claude Code session, every MCP client already has a filesystem MCP client built in. By implementing the filesystem server contract, AROS requires zero new client-side tooling. An agent that can `read_text_file` and `write_file` can participate in the review pipeline without any AROS-specific SDK, adapter, or tool registration. The filesystem is the API.

The server is implemented in TypeScript using `@modelcontextprotocol/sdk ^1.24.0`, Zod for schema validation, and `zod-to-json-schema` for tool definition introspection. Transport is STDIO for agent communication and optionally SSE/HTTP for dashboard integration.

**Tool Annotations** are preserved exactly from the reference server:

| Tool | readOnlyHint | idempotentHint | destructiveHint |
|---|---|---|---|
| `read_text_file` | true | – | – |
| `read_media_file` | true | – | – |
| `read_multiple_files` | true | – | – |
| `read_file` (deprecated) | true | – | – |
| `list_directory` | true | – | – |
| `list_directory_with_sizes` | true | – | – |
| `directory_tree` | true | – | – |
| `search_files` | true | – | – |
| `get_file_info` | true | – | – |
| `list_allowed_directories` | true | – | – |
| `create_directory` | false | true | false |
| `write_file` | false | true | true |
| `edit_file` | false | false | true |
| `move_file` | false | false | false |

### 3.2 Project Directory Structure — Real Files on Disk

AROS persists all files to disk in the project directory. There is no virtual filesystem, no database abstraction, no object store for MVP. The directory structure IS the data model. `read_text_file` reads a real file on disk. `write_file` writes a real file on disk. `list_directory` lists a real directory. The reference filesystem MCP server's `fs` module calls operate on actual disk I/O unchanged. The project directory is the single source of truth.

On startup, AROS takes a project root path as the allowed directory argument — identical to how the reference filesystem server accepts allowed directories. It initializes the directory structure if it doesn't exist:

```
{project_root}/
├── inbox/                          # Submit deliverables by writing here
│   └── {write a file here}        → triggers pipeline
├── queue/
│   ├── objective/                  # Deliverables in objective review
│   │   └── {deliverable_id}.md
│   ├── subjective/                 # Deliverables in subjective review
│   │   └── {deliverable_id}.md
│   └── human/                      # Deliverables awaiting human review
│       └── {deliverable_id}.md
├── review/
│   ├── {deliverable_id}/
│   │   ├── content.md              # The deliverable content
│   │   ├── brief.md                # Original production instructions
│   │   ├── objective_results.json  # Objective check outputs
│   │   ├── subjective_results.json # AI review scores and rationale
│   │   ├── feedback.json           # Structured feedback on rejection/revision
│   │   ├── status.json             # Current pipeline state, lock status
│   │   ├── history/
│   │   │   ├── v1.md              # Original submission
│   │   │   ├── v1_feedback.json
│   │   │   ├── v2.md              # First revision
│   │   │   └── v2_feedback.json
│   │   └── decision.json           # Written by human reviewer
│   └── ...
├── approved/                       # Terminal state: approved deliverables
│   └── {deliverable_id}.md
├── rejected/                       # Terminal state: rejected deliverables
│   └── {deliverable_id}.md
├── revisions/                      # Resubmit revisions by writing here
│   └── {deliverable_id}.md        → re-enters pipeline
├── callbacks/                      # Event files for notifications
│   └── {deliverable_id}/
│       └── {event}.json
├── policies/
│   ├── default.json
│   ├── blog-post.json
│   └── code-review.json
├── templates/
│   ├── revision_prompt.md
│   └── rejection_analysis.md
└── metrics/
    ├── summary.json
    └── by_agent.json
```

Every artifact — content, review results, feedback, status, decisions, policies, templates — is a real file on disk. An operator can `ls`, `cat`, `grep`, and `find` against the project directory with standard shell tools. Git can track the entire review history. Backups are `cp -r`. Migration is `rsync`. There is no data locked inside a database that requires special tooling to access.

**Pipeline state transitions are file moves.** When a deliverable passes objective review, AROS moves it from `queue/objective/` to `queue/subjective/` using `fs.rename` — a real rename on disk. When approved, the content file is copied to `approved/`. The filesystem is the state machine.

**Concurrency is managed through filesystem primitives.** Write locks use `O_EXCL` flag on status files. Atomic writes use write-to-temp-then-rename. For MVP with single-process AROS, this is sufficient. Multi-process deployments would add `flock` or an advisory lock file.

**Path validation via `validatePath()`** ensures all operations stay within the project root, exactly as the reference server does. Additionally, AROS hooks into `write_file` and `move_file` to enforce pipeline state constraints: writes to `review/{id}/content.md` are rejected (content is managed by the pipeline), reads from `approved/{id}.md` return not-found until the pipeline completes, and writes to `revisions/{id}.md` are rejected unless that deliverable is in `revision_requested` state. These constraints are checked by reading the real `status.json` file from disk before allowing the operation.

**No database for MVP.** The filesystem is the database. Status is a JSON file. Feedback is a JSON file. Review results are JSON files. This trades query performance for simplicity, debuggability, and portability. A database layer can be added later as a read-optimized index over the filesystem if query patterns demand it — but the files on disk remain the source of truth.

### 3.3 Tool Mapping to AROS Operations

#### Read-Only Tools

**`read_text_file`** — Read any file in the project directory. Reading `review/{id}/status.json` is equivalent to checking deliverable status. Reading `review/{id}/feedback.json` retrieves structured feedback. Reading `review/{id}/content.md` retrieves the deliverable. Supports `head` and `tail` parameters for paginating large deliverables or long feedback histories.

**`read_media_file`** — Read binary deliverables (images, audio). Returns base64 with correct MIME type. Enables review of non-text deliverables.

**`read_multiple_files`** — Batch read. An agent can read `["{project_root}/review/{id}/content.md", "{project_root}/review/{id}/objective_results.json", "{project_root}/review/{id}/subjective_results.json"]` in a single call. Per-file error handling means a missing subjective result (stage not yet run) doesn't block reading the content and objective results.

**`read_file`** — Deprecated alias for `read_text_file`. Supported for backward compatibility.

**`list_directory`** — List contents of any directory. `list_directory("{project_root}/queue/human")` returns all deliverables awaiting human review. `list_directory("{project_root}/review/{id}/history")` shows all revision versions.

**`list_directory_with_sizes`** — Enhanced listing with file sizes and sorting. Sort by size to prioritize review of smaller deliverables, or by name for alphabetical ordering.

**`directory_tree`** — Recursive tree of any path. `directory_tree("{project_root}/review/{id}")` returns the complete review artifact set in one call. The `depth` parameter limits recursion. `excludePatterns` filters out history directories or large binary artifacts.

**`search_files`** — Glob-based search. `search_files("{project_root}/review", "**/*feedback.json")` finds all feedback files across all deliverables. `search_files("{project_root}/approved", "**/*.md")` lists all approved markdown deliverables.

**`get_file_info`** — Metadata for any file. Returns size, creation time (submission time), modified time (last revision time), and permissions (read-only if locked, read-write if in revision state). The permissions field encodes lock state.

**`list_allowed_directories`** — Returns the allowed directories for this AROS instance. Tells the agent what scope it has.

#### Write Operations

**`write_file`** — The primary submission mechanism.

Writing to `{project_root}/inbox/{filename}` triggers deliverable submission. The file content is the deliverable. Metadata is provided by a companion `.meta.json` file written to inbox first:

```json
{
  "title": "Q3 Blog Post",
  "source_agent": "content-writer-01",
  "brief": "Write a 1500 word blog post about...",
  "policy": "blog-post",
  "content_type": "text/markdown",
  "notifications": [
    {
      "driver": "paperclip",
      "target": { "issue_id": "ISS-472", "agent_id": "content-writer-01" },
      "events": ["approved", "revision_requested", "rejected"]
    }
  ]
}
```

AROS intercepts the write, creates a deliverable ID, applies the specified policy, starts the pipeline, and the file appears in `queue/objective/{id}.md`.

Writing to `{project_root}/revisions/{deliverable_id}.md` submits a revision. AROS matches the filename to an existing deliverable in `revision_requested` state and restarts the pipeline from the failing stage.

Writing to `{project_root}/review/{id}/decision.json` is how a human reviewer submits their decision:

```json
{
  "decision": "revision_requested",
  "reason": "Technical accuracy section contradicts the reference architecture.",
  "annotations": [
    {
      "target": "section:3",
      "comment": "AWS Lambda is not a container service",
      "severity": "critical"
    }
  ]
}
```

Writing to `{project_root}/policies/{name}.json` creates or updates a review policy.

**`edit_file`** — Pattern-based edits on deliverables in revision state. An agent performing a revision can use `edit_file` on `{project_root}/revisions/{deliverable_id}.md` to make targeted changes rather than rewriting the entire document. The `dryRun: true` option lets the agent preview edits before committing.

#### Directory and File Management

**`create_directory`** — Create organizational structures within writable directories. Agents cannot create directories in `queue/` or `review/` — those are managed by the pipeline.

**`move_file`** — The pipeline uses this internally for state transitions. Exposed to agents for organizational purposes within writable directories. Moving a file out of `review/` is blocked.

### 3.4 Review Stage Configurations

**Objective stage config:**

```json
{
  "checks": [
    {
      "type": "grammar",
      "params": { "language": "en-US" },
      "severity": "blocking"
    },
    {
      "type": "word_count",
      "params": { "min": 1000, "max": 2000 },
      "severity": "blocking"
    },
    {
      "type": "required_sections",
      "params": { "sections": ["Introduction", "Conclusion"] },
      "severity": "warning"
    },
    {
      "module": "tools/vale",
      "version": "1.0",
      "config": { "styles": ["Microsoft", "write-good"] },
      "severity": "blocking"
    }
  ],
  "fail_threshold": 1
}
```

Each check type is a module with a standard interface. Built-in types include `grammar`, `spelling`, `word_count`, `format_schema`, `code_lint`, `factual_consistency`, `required_sections`, `regex_pattern`, and `custom`. External tools (Vale, ESLint, markdownlint) are installable as modules.

**Subjective stage config:**

```json
{
  "evaluation_model": "claude-sonnet-4-20250514",
  "criteria": [
    {
      "name": "coherence",
      "description": "Logical flow between paragraphs and sections...",
      "weight": 0.3,
      "scale": 10
    },
    {
      "name": "tone_alignment",
      "description": "Matches the target audience and brand voice...",
      "weight": 0.25,
      "scale": 10
    },
    {
      "name": "argument_strength",
      "description": "Claims are well-supported with evidence...",
      "weight": 0.25,
      "scale": 10
    },
    {
      "name": "originality",
      "description": "Avoids cliché, provides fresh perspective...",
      "weight": 0.2,
      "scale": 10
    }
  ],
  "pass_threshold": 7.0,
  "require_rationale": true,
  "reference_materials": ["aros://policies/style-guide.md"],
  "system_prompt_override": null
}
```

A policy can define multiple subjective stages with different criteria or personas (e.g., technical accuracy review, editorial quality review, compliance check) — all on the same deliverable. All must pass.

**Human stage config:**

```json
{
  "assignment_strategy": "round_robin",
  "required_reviewers": 1,
  "consensus_rule": "all_approve",
  "sla_hours": 24,
  "show_ai_reviews": true
}
```

### 3.5 Pipeline Execution Flow

1. Agent calls `write_file` to `{project_root}/inbox/` with content and `.meta.json`.
2. AROS validates the submission, assigns an ID, and begins executing the pipeline.
3. **Objective stage**: AROS runs all configured checks. Results are stored in `review/{id}/objective_results.json`. If blocking failures exceed threshold, status becomes `revision_requested` with structured feedback. Pipeline halts.
4. If objective passes (or policy allows proceeding with warnings), **subjective stage** fires. AROS constructs a prompt for a Claude review agent that includes the deliverable, the original brief, reference materials, and evaluation criteria. The Claude agent returns structured scores and commentary, stored in `review/{id}/subjective_results.json`. If below threshold, `revision_requested`.
5. If subjective passes, **human review stage** activates. The deliverable enters the human review queue (`queue/human/`). A human reviewer is assigned per the configured strategy.
6. Human reviews via dashboard (or directly via filesystem tools), sees the content, brief, objective results, subjective scores, and revision history. They write a `decision.json` to approve, reject, or request revision.
7. On rejection or revision request at any stage, feedback is written to `review/{id}/feedback.json`. Notification drivers fire. The originating agent receives the notification and reads feedback via filesystem tools.
8. Revised content written to `{project_root}/revisions/{id}.md` re-enters the pipeline at the stage that rejected it.
9. Maximum revision cycles are enforced per policy. Exceeding triggers escalation.

### 3.6 Feedback Structure

Every rejection or revision request produces a standardized feedback object written to `review/{id}/feedback.json`:

```json
{
  "stage": "subjective",
  "decision": "revision_requested",
  "summary": "The report lacks specificity in the market analysis section and the tone shifts between formal and casual in sections 3-4.",
  "issues": [
    {
      "category": "specificity",
      "description": "Market sizing claims lack supporting data points",
      "location": "section:2, paragraphs 3-5",
      "severity": "critical",
      "suggestion": "Add specific TAM/SAM/SOM figures from the industry report referenced in the brief"
    },
    {
      "category": "tone_consistency",
      "description": "Sections 3-4 shift to informal register",
      "location": "section:3-4",
      "severity": "major",
      "suggestion": "Maintain the formal analytical tone established in sections 1-2"
    }
  ],
  "scores": {
    "coherence": { "score": 7, "rationale": "..." },
    "tone_alignment": { "score": 5, "rationale": "..." },
    "argument_strength": { "score": 4, "rationale": "..." },
    "originality": { "score": 8, "rationale": "..." }
  },
  "reviewer": "subjective-reviewer-agent",
  "timestamp": "2026-03-10T14:23:00Z"
}
```

This structure is what makes the feedback loop functional. Agents receiving this can parse it programmatically and attempt targeted revisions using `edit_file` rather than blind regeneration.

---

## 4. Blocking and Lock Enforcement

### 4.1 Lock Enforcement Through Filesystem Permissions

The lock protocol maps directly to filesystem permissions as reported by `get_file_info`:

**Locked deliverable**: `content.md` in `review/{id}/` has read-only permissions. `read_text_file` succeeds. `write_file` to that path fails with a permissions error. The error message includes the deliverable ID and instructions to read `status.json`.

**Released (approved)**: Content appears in `{project_root}/approved/{id}.md`. Agents check via `search_files("{project_root}/approved", "{id}*")` or `read_text_file("{project_root}/review/{id}/status.json")`.

**Released (rejected)**: Content appears in `{project_root}/rejected/{id}.md` with feedback at `{project_root}/review/{id}/feedback.json`.

An agent that tries to use deliverable content before approval will find it only in `review/{id}/content.md` with read-only permissions. It will not exist in `approved/` until the pipeline completes. The filesystem itself is the lock.

**Timeout policy**: Configurable per policy. If human review does not complete within the SLA window, the lock can either remain indefinitely (strict mode), auto-release with a warning flag (permissive mode), or escalate to a fallback reviewer.

### 4.2 Integration with External Orchestrators

AROS blocks the originating agent by controlling content availability through the filesystem, and notifies the agent's orchestrator through native notification drivers. The agent's orchestrator (PaperclipAI, Temporal, etc.) handles its own blocking semantics. AROS handles notification.

**Example flow with PaperclipAI:**

```
Agent generates content during heartbeat
        │
        ▼
write_file("{project_root}/inbox/...") ──→ AROS pipeline starts
        │
        ▼
Agent blocks its own PaperclipAI issue (agent's responsibility)
        │
        ▼
Agent dormant ◄── heartbeat exits
        │
        │  (AROS pipeline: objective → subjective → human)
        │
        ▼
AROS terminal state reached
        │
        ▼
PaperclipAI driver fires: posts @-mention comment on the issue
        │
        ▼
Agent wakes on @-mention
        │
        ▼
read_text_file("{project_root}/review/{id}/status.json") ──→ confirm state
        │
        ├── approved → read approved content → proceed → unblock issue
        ├── revision_requested → read feedback → revise → write to /revisions/ → re-block
        └── rejected → escalate → stay blocked or close issue
```

The agent confirms state via filesystem MCP (the detector). PaperclipAI's API manages issue lifecycle (the actuator). The AROS notification driver posts the @-mention comment (the trigger). These three roles are cleanly separated.

**Failure modes:**

If the notification driver cannot reach PaperclipAI: AROS retries with exponential backoff. After max retries, writes a failure record to `review/{id}/webhook_failures.json`. Mitigation: a periodic self-check heartbeat where the agent polls `status.json` directly, used only as a fallback for failed notifications.

If the agent crashes between submit and block: On restart, the agent re-examines its issue state, finds no approved content, detects the pending AROS deliverable via `search_files`, and blocks retroactively.

If the human reviewer never reviews: AROS SLA escalation fires. The escalation notification (via the configured driver) alerts the appropriate party.

---

## 5. Triggering Revisions

Three trigger paths, all producing the same structured feedback object:

**Path A — Automatic.** Objective or subjective stage failure. No human involved. AROS constructs feedback from the failing stage's output and sets status to `revision_requested`. Notification drivers fire.

**Path B — Human-initiated.** Reviewer writes `decision.json` with `"decision": "revision_requested"`. AROS updates status and fires notifications.

**Path C — Agent-initiated revision pull.** A dedicated revision agent actively pulls work from the revision queue:

```
list_directory("{project_root}/queue/objective")  — find deliverables failing objective
search_files("{project_root}/review", "**/*feedback.json") — find all feedback
read_multiple_files([content, feedback, brief]) — load context for revision
```

**Autonomous revision mode** (configurable per policy):

```json
{
  "revision_handling": {
    "mode": "auto_revise",
    "auto_revise_config": {
      "model": "claude-sonnet-4-20250514",
      "max_auto_revisions": 2,
      "system_prompt": "You are a revision specialist...",
      "escalate_after_auto_fail": true
    }
  }
}
```

In `auto_revise` mode, AROS dispatches a Claude agent to revise the content using structured feedback, then resubmits to the pipeline. In `hybrid` mode, AROS auto-revises minor/moderate issues but escalates critical issues back to the originating agent or a human.

**Prompt Templates** for revision are first-class objects:

```markdown
<!-- {project_root}/templates/revision_prompt.md -->
You previously generated the following content:

<original_brief>
{{deliverable.metadata.brief}}
</original_brief>

<your_output>
{{deliverable.content}}
</your_output>

This content was reviewed and requires revision:

<review_feedback>
Summary: {{feedback.summary}}

Issues:
{{#each feedback.issues}}
- [{{this.severity}}] {{this.category}}: {{this.description}}
  Location: {{this.location}}
  Suggestion: {{this.suggestion}}
{{/each}}
</review_feedback>

Revise the content to address all critical and major issues.
Do not alter sections that were not flagged.
Return only the revised content.
```

Templates are versioned, editable through the filesystem, and testable against historical feedback objects.

---

## 6. Auto-Approval Rules

**Approval Bypass Rules** are evaluated before the pipeline executes. If a bypass rule matches, the deliverable skips some or all review stages.

### 6.1 By Content Type

```json
{
  "condition": {
    "type": "content_type_match",
    "content_types": ["text/changelog", "text/commit-message", "application/config"]
  },
  "bypass_stages": ["subjective", "human"]
}
```

Low-risk, formulaic content types skip subjective and human review. Objective checks still run.

### 6.2 By Source Agent

```json
{
  "condition": {
    "type": "agent_trust",
    "agent_ids": ["agent-senior-writer-01"],
    "minimum_historical_pass_rate": 0.95,
    "minimum_submissions": 50
  },
  "bypass_stages": ["human"]
}
```

Trust is quantitative, computed from the agent's historical pass rate. Trust revokes automatically if the pass rate drops below threshold over a rolling window.

### 6.3 By Similarity (Content Fingerprinting)

```json
{
  "condition": {
    "type": "similarity_match",
    "method": "embedding_cosine",
    "threshold": 0.95,
    "reference_set": "approved_corpus"
  },
  "bypass_stages": ["subjective", "human"]
}
```

If a new deliverable is structurally or semantically near-identical to previously approved content, it bypasses subjective and human review. Use cases: templated reports, localization variants, minor updates.

Similarity bypass never skips objective checks — a document can be structurally identical to an approved one but contain factual errors in new data.

### 6.4 Combined Conditions

```json
{
  "condition": {
    "type": "all_of",
    "conditions": [
      { "type": "agent_trust", "agent_ids": ["agent-report-gen"], "minimum_historical_pass_rate": 0.97, "minimum_submissions": 100 },
      { "type": "content_type_match", "content_types": ["text/weekly-report"] },
      { "type": "similarity_match", "method": "template_match", "threshold": 0.90, "reference_set": "approved_corpus" }
    ]
  },
  "bypass_stages": ["subjective", "human"]
}
```

All conditions must hold. Any deviation triggers the full pipeline.

---

## 7. Notification System: Native Consumer Integrations

AROS is the orchestration layer. It owns notification actions. When a deliverable is approved, AROS unblocks the PaperclipAI issue itself — it calls the API, posts the comment, formats the message correctly for that system's conventions. Consumers do not need adapters. AROS speaks each consumer's language natively through notification drivers.

### 7.1 Driver Interface

```typescript
interface NotificationDriver {
  name: string;
  validateTarget(target: Record<string, unknown>): ValidationResult;
  notify(event: ArosEvent, target: Record<string, unknown>): Promise<NotifyResult>;
}

interface ArosEvent {
  event: "approved" | "rejected" | "revision_requested" | "stage_completed" | "sla_exceeded";
  deliverable_id: string;
  timestamp: string;
  status: DeliverableStatus;
  feedback?: StructuredFeedback;
  approved_content_path?: string;
  revision_number?: number;
  max_revisions_remaining?: number;
  policy_name: string;
}

interface NotifyResult {
  success: boolean;
  external_id?: string;
  retry?: boolean;
  error?: string;
}
```

Each driver implements `validateTarget` and `notify`. Adding a new system means writing one module.

### 7.2 PaperclipAI Driver (First Implementation)

The PaperclipAI driver knows:

- The PaperclipAI API endpoint (configured via env vars)
- How to post comments with @-mentions to wake agents
- How to format review feedback into parseable comments
- PaperclipAI's dedup rules (fresh comment text required to re-trigger heartbeats)

On `approved`: Posts a comment with @-mention including the deliverable ID and approved content path.

On `revision_requested`: Posts a comment summarizing critical/major issue counts, the feedback summary, and the feedback file path.

On `rejected`: Posts a comment with revision count, rejection summary, and escalation notice.

On `sla_exceeded`: Posts a warning comment about the exceeded SLA and current pipeline stage.

The driver formats messages in PaperclipAI's conventions, includes the @-mention to trigger heartbeat wake, summarizes feedback inline so the agent's heartbeat log is readable without extra MCP calls, and includes filesystem paths for full detail retrieval.

### 7.3 Planned Drivers

| Driver | Target Fields | What AROS Does on Event |
|---|---|---|
| `paperclip` | `issue_id`, `agent_id` | Posts formatted @-mention comment with feedback summary and filesystem paths |
| `slack` | `channel_id`, optional `thread_ts` | Posts to channel/thread with status and dashboard link |
| `linear` | `issue_id` | Adds comment, updates custom fields for review status |
| `github` | `repo`, `issue_number` or `pr_number` | Posts comment, optionally updates labels |
| `email` | `to`, optional `cc` | Sends formatted email with review summary and inline feedback |
| `temporal` | `workflow_id`, `signal_name` | Sends signal to unblock waiting workflow activity |
| `webhook` | `url`, `headers`, `method` | Generic fallback for systems without a dedicated driver |

The `webhook` driver is the "we haven't built that driver yet" pattern, not the primary pattern.

### 7.4 Driver Configuration

Each driver declares required environment variables. AROS validates at startup.

```
AROS_PAPERCLIP_API_URL=https://paperclip.example.com/api
AROS_PAPERCLIP_API_KEY=sk_live_...
AROS_SLACK_BOT_TOKEN=xoxb-...
AROS_LINEAR_API_KEY=lin_api_...
AROS_GITHUB_TOKEN=ghp_...
AROS_SMTP_HOST=smtp.example.com
AROS_SMTP_PORT=587
AROS_SMTP_USER=...
AROS_SMTP_PASS=...
```

If a deliverable references a driver whose env vars are not configured, `validateTarget` fails at submission time. The agent gets an immediate error from `write_file` — not a silent failure hours later.

### 7.5 Driver as Skill

Drivers are installable as skills:

```
/mnt/skills/aros-drivers/
├── paperclip/
│   ├── SKILL.md
│   ├── driver.ts
│   └── config.schema.json
├── slack/
│   ├── SKILL.md
│   ├── driver.ts
│   └── config.schema.json
└── linear/
    ├── SKILL.md
    ├── driver.ts
    └── config.schema.json
```

Each skill declares env vars in `config.schema.json`. AROS reads available drivers from the skills directory at startup. Installing a new driver is dropping a skill folder and adding env vars. No code changes to AROS core.

### 7.6 Policy-Level Default Notifications

Policies can define default notifications that apply to every deliverable under that policy:

```json
{
  "name": "blog-post",
  "stages": ["..."],
  "default_notifications": [
    {
      "driver": "slack",
      "target": { "channel_id": "C04CONTENT" },
      "events": ["approved", "rejected", "sla_exceeded"]
    }
  ]
}
```

Per-deliverable and policy-level notifications both fire. Deduplication is by `(driver, target, event)` tuple.

### 7.7 Submission with Multiple Notifications

```json
{
  "title": "Q3 Performance Report",
  "source_agent": "report-gen-01",
  "brief": "Generate a 2000-word quarterly performance report...",
  "policy": "executive-report",
  "content_type": "text/markdown",
  "notifications": [
    {
      "driver": "paperclip",
      "target": { "issue_id": "ISS-472", "agent_id": "report-gen-01" },
      "events": ["approved", "revision_requested", "rejected"]
    },
    {
      "driver": "slack",
      "target": { "channel_id": "C04CONTENT", "thread_ts": "1710072180.000100" },
      "events": ["approved", "rejected"]
    },
    {
      "driver": "email",
      "target": { "to": "content-lead@company.com" },
      "events": ["sla_exceeded"]
    }
  ]
}
```

When the report is approved: AROS posts a comment on PaperclipAI issue ISS-472, posts to the Slack thread, and does nothing with email (subscribed to `sla_exceeded` only). Three systems notified in three ways, all handled by AROS, zero consumer-side code.

---

## 8. Folders and Multi-Asset Deliverables

A **Folder** is a grouped set of related files submitted as a single deliverable. The folder moves through the pipeline as one unit, but individual files within it are reviewed independently. Each file gets its own objective checks, its own subjective scores, its own feedback. The folder-level decision aggregates file-level results according to a configurable strategy.

This maps directly to the filesystem MCP contract. A folder is a directory on disk. Agents already know how to `create_directory` and `write_file` into it.

Content production rarely outputs a single file. Real deliverables are sets: an ad campaign produces 5 creative variants across 3 aspect ratios; a brand refresh generates logo variations in 12 color combinations; a blog post comes with a hero image, social media crops, and an email header; a code change includes implementation, test file, and documentation. Reviewing these as independent deliverables loses the relationship. Reviewing them as a single blob prevents file-level feedback. Folders solve both.

### Submission via Filesystem

An agent creates a directory in inbox and writes files into it. The write of `.meta.json` at the folder root triggers pipeline entry — it is always the commit point:

```
create_directory("{project_root}/inbox/ad-campaign-q3")
write_file("{project_root}/inbox/ad-campaign-q3/hero-variant-a.png", imageDataA)
write_file("{project_root}/inbox/ad-campaign-q3/hero-variant-b.png", imageDataB)
write_file("{project_root}/inbox/ad-campaign-q3/hero-variant-c.png", imageDataC)
write_file("{project_root}/inbox/ad-campaign-q3/hero-variant-d.png", imageDataD)
write_file("{project_root}/inbox/ad-campaign-q3/headline-copy.md", headlineCopy)

# This write triggers pipeline entry — everything in the directory at this moment is included
write_file("{project_root}/inbox/ad-campaign-q3/.meta.json", JSON.stringify({
  "title": "Q3 Ad Campaign Creatives",
  "source_agent": "creative-gen-01",
  "brief": "Generate 4 hero image variants for the Q3 campaign...",
  "policy": "ad-creative-review",
  "folder": {
    "strategy": "select",
    "select_count": 2,
    "file_policy_overrides": {
      "*.png": "image-review",
      "*.md": "copy-review"
    }
  },
  "notifications": [
    { "driver": "paperclip", "target": { "issue_id": "ISS-501", "agent_id": "creative-gen-01" }, "events": ["approved", "revision_requested", "rejected"] }
  ]
}))
```

AROS scans the directory, inventories all files (excluding `.meta.json`), creates a folder deliverable ID, moves the entire directory to `review/`, and starts the pipeline.

### Directory Structure for Folders on Disk

```
{project_root}/review/{folder_deliverable_id}/
├── content/                            # The folder contents — real files on disk
│   ├── hero-variant-a.png
│   ├── hero-variant-b.png
│   ├── hero-variant-c.png
│   ├── hero-variant-d.png
│   └── headline-copy.md
├── meta.json
├── brief.md
├── status.json                         # Folder-level status
├── feedback.json                       # Folder-level aggregated feedback
├── files/                              # Per-file review artifacts
│   ├── hero-variant-a.png/
│   │   ├── objective_results.json
│   │   ├── subjective_results.json
│   │   ├── feedback.json
│   │   └── status.json                # Per-file: passed/failed/revision_requested
│   ├── hero-variant-b.png/
│   │   └── ...
│   ├── hero-variant-c.png/
│   │   └── ...
│   ├── hero-variant-d.png/
│   │   └── ...
│   └── headline-copy.md/
│       └── ...
├── selection/                          # Selection/ranking artifacts (for select/rank strategies)
│   ├── rankings.json                   # AI-generated comparative ranking with rationale
│   └── decision.json                   # Human selection decision
├── history/
│   └── ...
└── decision.json                       # Folder-level human decision
```

All real files on disk. An agent reads the entire folder state:

```
directory_tree("{project_root}/review/{id}")
```

Reads a specific file's review results:

```
read_text_file("{project_root}/review/{id}/files/hero-variant-a.png/subjective_results.json")
```

Batch-reads all subjective results:

```
search_files("{project_root}/review/{id}/files", "**/*subjective_results.json")
```

### 8.1 Folder Strategies

The `folder.strategy` field in `.meta.json` determines how individual file results aggregate into a folder-level decision.

**`all_pass`** — Every file must independently pass all review stages. If any file fails, the folder is marked `revision_requested` with per-file feedback. The agent can revise individual files without resubmitting the entire folder.

Use case: a code change where implementation, tests, and docs must all pass.

```json
{ "strategy": "all_pass" }
```

**`select`** — A subset of files must be selected from the folder. All files are reviewed independently. Files that pass all stages become eligible for selection. The subjective stage produces a comparative ranking. The human reviewer sees the ranking as a recommendation and makes the final selection by writing `selection/decision.json`.

Use case: 4 ad creative variants, pick the best 2.

```json
{
  "strategy": "select",
  "select_count": 2,
  "allow_select_fewer": false
}
```

`allow_select_fewer`: If `true`, the reviewer can select fewer than `select_count` and request revision for more/better variants. If `false`, exactly `select_count` must be selected or the folder is sent back.

Files not selected are `not_selected` — neither approved nor rejected. Files that fail review are `ineligible` and cannot be selected.

**`rank`** — All files are reviewed, ranked by the AI subjective reviewer, and the ranking is presented to the human reviewer for confirmation or override. No fixed count. Output is an ordered list.

Use case: prioritizing color variations for A/B testing, ordering image resolutions by quality.

```json
{ "strategy": "rank" }
```

**`categorize`** — Files are grouped into categories by glob pattern. Each category has minimum passing requirements. The folder passes when every category meets its minimum.

Use case: a product listing needing at least 1 hero image, 3+ gallery images, and 1 description.

```json
{
  "strategy": "categorize",
  "categories": {
    "hero_image": { "pattern": "hero-*.png", "min_required": 1 },
    "gallery": { "pattern": "gallery-*.png", "min_required": 3 },
    "description": { "pattern": "*.md", "min_required": 1 }
  }
}
```

### 8.2 Per-File Policy Overrides

Different file types within a folder may need different review criteria. A PNG needs visual quality checks. A markdown file needs prose quality checks. Per-file policy overrides map glob patterns to policies:

```json
{
  "file_policy_overrides": {
    "*.png": "image-review",
    "*.jpg": "image-review",
    "*.md": "copy-review",
    "*.ts": "code-review"
  }
}
```

If a file matches a pattern, its objective and subjective stages use the overridden policy's stage configurations. If no pattern matches, the folder-level policy applies. The human review stage is always folder-level — the reviewer sees all files together.

### 8.3 Selection and Ranking Pipeline

For `select` and `rank` strategies, the subjective review stage includes an additional comparative evaluation. After scoring each file individually, AROS dispatches a second Claude agent call with all files and their individual scores, asking for a comparative ranking:

```json
// Written to selection/rankings.json on disk
{
  "ranking": [
    {
      "file": "hero-variant-b.png",
      "rank": 1,
      "individual_score": 8.4,
      "comparative_rationale": "Strongest visual hierarchy, best color contrast for the target demographic, most distinctive from competitor creative."
    },
    {
      "file": "hero-variant-d.png",
      "rank": 2,
      "individual_score": 7.9,
      "comparative_rationale": "Strong composition, slightly weaker brand color integration than variant B but better typography placement."
    },
    {
      "file": "hero-variant-a.png",
      "rank": 3,
      "individual_score": 7.1,
      "comparative_rationale": "Competent but generic. Does not differentiate from the existing campaign."
    },
    {
      "file": "hero-variant-c.png",
      "rank": 4,
      "individual_score": 5.3,
      "comparative_rationale": "Color palette conflicts with brand guidelines. Text readability issues."
    }
  ],
  "recommendation": "Select variants B and D. They complement each other — B for primary placement, D for secondary/social."
}
```

The human reviewer reads this file, then writes their selection:

```json
// Written to selection/decision.json on disk
{
  "selected": ["hero-variant-b.png", "hero-variant-d.png"],
  "rationale": "Agreed with AI recommendation. B for hero, D for social."
}
```

### 8.4 Folder Revisions

When a folder receives `revision_requested`, the feedback specifies which files need revision:

```json
// feedback.json on disk
{
  "folder_level": {
    "summary": "2 of 4 variants need revision. Headline copy approved.",
    "decision": "revision_requested"
  },
  "per_file": {
    "hero-variant-a.png": { "status": "revision_requested", "feedback": { "..." : "..." } },
    "hero-variant-b.png": { "status": "passed" },
    "hero-variant-c.png": { "status": "revision_requested", "feedback": { "..." : "..." } },
    "hero-variant-d.png": { "status": "passed" },
    "headline-copy.md": { "status": "passed" }
  }
}
```

The agent revises only the flagged files by writing replacements to the revisions directory:

```
create_directory("{project_root}/revisions/{folder_id}")
write_file("{project_root}/revisions/{folder_id}/hero-variant-a.png", revisedImageA)
write_file("{project_root}/revisions/{folder_id}/hero-variant-c.png", revisedImageC)
```

AROS detects the revision directory, replaces only the specified files in the folder's `content/` directory on disk, preserves the passing files untouched, and re-enters the pipeline for the revised files only. Passing files are not re-reviewed.

### 8.5 Folder Approval and Output

On approval, the folder's selected/approved files are copied to the `approved/` directory on disk:

For `all_pass`: all files copied.

```
{project_root}/approved/{folder_id}/
├── hero-variant-a.png
├── hero-variant-b.png
├── hero-variant-c.png
├── hero-variant-d.png
└── headline-copy.md
```

For `select`: only selected files copied, with the selection metadata.

```
{project_root}/approved/{folder_id}/
├── hero-variant-b.png
├── hero-variant-d.png
└── selection.json
```

For `rank`: all passing files copied with the confirmed ranking.

```
{project_root}/approved/{folder_id}/
├── hero-variant-b.png    (rank 1)
├── hero-variant-d.png    (rank 2)
├── hero-variant-a.png    (rank 3)
└── rankings.json
```

For `categorize`: all files that satisfy category minimums, organized by category.

```
{project_root}/approved/{folder_id}/
├── hero_image/
│   └── hero-main.png
├── gallery/
│   ├── gallery-1.png
│   ├── gallery-2.png
│   └── gallery-3.png
└── description/
    └── product-description.md
```

---

## 9. Marketplace for Objective Review Modules

Objective checks are modular. Each check type implements a standard interface:

```typescript
interface ObjectiveCheckModule {
  name: string;
  version: string;
  description: string;
  input_types: string[];  // supported content_types
  config_schema: JSONSchema;
  execute(content: string, config: object): Promise<CheckResult>;
}

interface CheckResult {
  passed: boolean;
  severity: "blocking" | "warning";
  details: object;
  suggestions: string[];
}
```

**Module types:**

**Built-in**: Grammar, spelling, word count, regex patterns, required sections, JSON schema validation.

**Installed**: Added from a module registry. Each module is a containerized function or skill definition.

**Custom**: Written by the operator using the module SDK.

**Module composition in policies:**

```json
{
  "checks": [
    { "module": "aros/grammar", "version": "1.2", "config": { "language": "en-US" }, "severity": "blocking" },
    { "module": "community/medical-claims-checker", "version": "0.9", "config": { "reference_db": "pubmed" }, "severity": "blocking" },
    { "module": "custom/brand-voice-lexicon", "version": "1.0", "config": { "lexicon_path": "/data/brand-terms.json" }, "severity": "warning" }
  ]
}
```

---

## 10. Tool Installation and Configuration

### 9.1 Skills as Objective Check Modules

Tools like Vale, ESLint, and markdownlint are installable as AROS objective check modules:

```json
{
  "module": "tools/vale",
  "install": {
    "method": "skill",
    "skill_path": "/mnt/skills/user/vale",
    "dependencies": ["vale binary", ".vale.ini config"]
  },
  "config": {
    "styles": ["Microsoft", "write-good", "custom-brand"],
    "min_alert_level": "warning",
    "custom_vocab": "/data/accepted-terms.txt"
  }
}
```

AROS executes the tool in a sandboxed environment, parses output into the standard `CheckResult` format, and includes it in objective stage results.

### 9.2 Environment Configuration

```
AROS_CLAUDE_API_KEY=...
AROS_DEFAULT_MODEL=claude-sonnet-4-20250514
AROS_HUMAN_REVIEW_SLA_HOURS=24
AROS_MAX_CONTENT_SIZE_MB=50
AROS_STORAGE_BACKEND=local
AROS_VALE_STYLES_PATH=/config/vale/styles
AROS_ESLINT_CONFIG_PATH=/config/.eslintrc
AROS_PAPERCLIP_API_URL=...
AROS_PAPERCLIP_API_KEY=...
AROS_SLACK_BOT_TOKEN=...
```

Per-module env vars follow `AROS_{MODULE_NAME}_{PARAM}`. Modules declare required vars in their config schema. AROS validates at startup.

---

## 11. Dashboard MVP

The dashboard is for human reviewers and system operators. Agents interact solely via the filesystem MCP.

### 10.1 Review Queue

Table of deliverables awaiting human review. Columns: title, content type, source agent, policy, time in queue, priority, objective result summary, subjective score, assigned reviewer. Sort and filter by all columns. Click to open the review workspace.

### 10.2 Review Workspace

**Left panel**: Deliverable content rendered appropriately (markdown rendered, code syntax-highlighted).

**Right panel, tabbed:**

- **Brief**: The original instructions that produced this content.
- **Objective Results**: List of checks, pass/fail/warning, expandable details.
- **Subjective Review**: Per-criterion scores, rationale from the AI reviewer, overall score.
- **Revision History**: Prior versions with diff view and prior feedback.

**Bottom bar**: Approve / Request Revision / Reject buttons. Revision and Reject require a reason field.

### 10.3 Pipeline Monitor

Status breakdown of all deliverables: queued, in objective review, in subjective review, awaiting human review, revision in progress, approved, rejected. Per-deliverable drill-down.

### 10.4 Analytics

Pass/fail rates by stage, policy, source agent, content type. Revision cycle distribution. Common rejection reasons. Human reviewer throughput and agreement rate with AI subjective review.

### 10.5 Policy Manager

CRUD interface for review policies. Stage builder: add/remove/reorder stages, configure each.

### 10.6 MVP Scope Reduction

**MVP retains**: Review queue, review workspace with all panels, approve/reject/revise flow, basic policy CRUD, deliverable status tracking, browser notifications.

**Deferred past MVP**: Analytics beyond basic counts, policy test mode, multi-reviewer consensus workflows, inline annotation (single free-text reason field instead), real-time pipeline monitor (simple status table with refresh).

---

## 12. Notifications and Mobile

### 11.1 Browser Notifications (MVP)

Dashboard registers a Service Worker. When a deliverable enters human review or receives a decision:

```json
{
  "title": "New review: Q3 Performance Report",
  "body": "From report-gen-01 | Policy: executive-report | AI score: 7.2",
  "action_url": "/review/d-20260310-001",
  "priority": "normal"
}
```

### 11.2 Mobile Push (Upgrade Path)

**PWA approach** (lower cost): Dashboard as Progressive Web App. Service Worker handles push on mobile browsers. No app store deployment.

**Native wrapper** (higher cost): Thin native shell (React Native or Capacitor) wrapping the dashboard WebView for reliable push via APNs/FCM.

### 11.3 Mobile Review Interface

Not the full dashboard. A focused review-and-decide interface:

- Swipe-through queue of pending reviews.
- Content rendered for mobile reading.
- Expandable panels for AI review results (collapsed by default, showing summary score).
- Three action buttons: Approve, Revise, Reject.
- Quick-action templates: pre-written revision reasons selectable with optional annotation.

---

## 13. Actions on Decision Outcomes

### 12.1 Action Hooks

```json
{
  "actions": {
    "on_approval": [
      {
        "type": "mcp_tool_call",
        "server": "content-management-mcp",
        "tool": "publish_content",
        "input_template": { "content": "{{deliverable.content}}", "destination": "production" }
      }
    ],
    "on_revision_requested": [
      {
        "type": "agent_dispatch",
        "mode": "prompt_template",
        "template_id": "revision_prompt",
        "target_agent": "revision-specialist-agent"
      }
    ],
    "on_rejection": [
      {
        "type": "log",
        "destination": "rejection_audit_log"
      }
    ]
  }
}
```

Notification driver calls and action hooks are separate concerns. Drivers notify external systems of state changes. Action hooks perform domain-specific work (publishing, dispatching revision agents, logging).

### 12.2 Action Chaining

Actions execute in order. Failure handling per action:

```json
{
  "on_failure": "continue | halt | fallback",
  "fallback": { "type": "notify", "..." : "..." }
}
```

### 12.3 Trigger Files

Actions can also be triggered by writing to specific paths:

```
write_file("{project_root}/review/{id}/actions/publish.trigger", "")
```

An empty write to a `.trigger` file executes the named action if the deliverable is in approved state.

---

## 14. Data Model

The data model is the filesystem. Each entity is a file or directory on disk. There are no database tables.

**Deliverable** — a directory: `review/{deliverable_id}/`

| File | Contents |
|---|---|
| `content.md` (or other extension) | The deliverable content, persisted to disk |
| `brief.md` | Original production instructions |
| `meta.json` | Metadata: title, source_agent, content_type, policy, notifications |
| `status.json` | Current pipeline state, current_stage, lock status, timestamps |
| `objective_results.json` | Objective check outputs |
| `subjective_results.json` | AI review scores and rationale |
| `feedback.json` | Structured feedback from the most recent rejection/revision |
| `decision.json` | Human reviewer's decision, reason, annotations |
| `history/v{n}.md` | Prior revision content |
| `history/v{n}_feedback.json` | Feedback that prompted that revision |

**Policy** — a JSON file: `policies/{policy_name}.json` containing stages, max_revisions, escalation_rules, bypass_rules, default_notifications, and action hooks.

**Notification Record** — a JSON file: `callbacks/{deliverable_id}/{event}.json` containing driver, target, status (sent/failed/retrying), attempts, last_error, and timestamps. One file per event fired.

**Queue Membership** — a symlink or file: `queue/{stage}/{deliverable_id}.md` pointing to or copied from the review directory. Presence in a queue directory indicates the deliverable is in that stage.

**Terminal State** — a file: `approved/{deliverable_id}.md` or `rejected/{deliverable_id}.md`. Presence indicates terminal state. For folders, a directory: `approved/{folder_id}/` containing the approved/selected files.

**Folder Deliverable** — a deliverable directory where `content/` is a directory of multiple files instead of a single file. Additional artifacts: `files/{filename}/` contains per-file review results. `selection/rankings.json` and `selection/decision.json` exist for `select` and `rank` strategies. `feedback.json` contains both `folder_level` and `per_file` feedback sections.

**Metrics** — JSON files in `metrics/` written and updated by AROS after each pipeline event. Aggregated from the review directory contents.

---

## 15. Key Design Decisions

**Why files on disk instead of a database?** Debuggability, portability, and tool compatibility. An operator can `cat status.json` to see pipeline state. `git log` tracks every review decision. `grep -r "critical" review/` finds all critical issues across all deliverables. `du -sh review/` shows storage usage. `rsync` handles backup and migration. Standard Unix tools work on the data model without any special client. A database can be added later as a read-optimized index over the filesystem for dashboard query performance — but the files remain the source of truth.

**Why the filesystem MCP contract?** Agents already speak filesystem. Zero client-side integration. An agent that can read and write files can participate in the review pipeline. The filesystem is the API. And because the files are real files on disk, the MCP server is a thin layer — it delegates to the OS for I/O and adds pipeline constraint enforcement on top.

**Why native notification drivers instead of generic webhooks?** A generic webhook pushes formatting, error handling, retry logic, and system-specific conventions to every consumer. With native drivers, AROS handles the integration once, correctly. Adding a new system means writing one driver module, not modifying every consumer.

**Why run Claude agents for subjective review?** Criteria change per policy, per content type. A prompted Claude agent handles arbitrary criteria at runtime without retraining. It produces written rationale for the feedback loop — a classifier outputs a score, a Claude agent outputs a score plus actionable explanation.

**Why enforce stage ordering?** Objective checks are cheap and fast. If content fails objective checks, running subjective review wastes tokens. Sequential with early termination is more efficient.

**Why structured feedback?** Agents need to parse feedback programmatically. A free-text paragraph is useless to an agent deciding which parts to revise. Structured feedback with categories, locations, severities, and suggestions is actionable input for automated revision.

**Why drivers as skills?** Decouples driver lifecycle from AROS core. New systems are supported by dropping a skill folder and adding env vars. No core deployments required.

---

## 16. MVP Implementation Sequence

| Step | Deliverable | Dependency |
|---|---|---|
| 1 | Project directory structure initialization and filesystem MCP server: `write_file` to inbox triggers pipeline, `read_text_file` for status/feedback, lock enforcement via file permissions, all state persisted as real files on disk | None |
| 2 | Objective review engine: grammar, word count, required sections, Vale integration. Results written to disk as JSON | Step 1 |
| 3 | Subjective review: prompt construction, Claude API call, structured score/feedback parsing, one revision prompt template. Results written to disk | Step 1 |
| 4 | Human review: `write_file` to `decision.json`, `list_directory` for queue | Step 1 |
| 5 | Dashboard: review queue, review workspace, browser notifications via Service Worker | Step 4 |
| 6 | PaperclipAI notification driver | Step 1 |
| 7 | Policy CRUD via filesystem (`write_file` to `{project_root}/policies/`), then dashboard UI | Step 1 |
| 8 | Two bypass rules: `content_type_match`, `agent_trust` (static whitelist for MVP) | Step 2 |
| 9 | Action hooks: on_approval, on_rejection, on_revision_requested | Step 4 |
| 10 | Folder support: `all_pass` and `select` strategies, per-file review artifacts on disk, folder-level aggregation | Step 3 |
| 11 | Basic analytics: counts and pass rates written to `metrics/` on disk | Step 4 |

Each step is deployable and testable independently. The system is functional for end-to-end single-file review after step 5. PaperclipAI integration lands at step 6. Folder support lands at step 10. The system is production-usable after step 9.

**Deferred past MVP**: Similarity-based auto-approval, mobile PWA/native app, module marketplace, dynamic agent trust scoring, multi-reviewer consensus, action chaining with failure handling, additional notification drivers (Slack, Linear, GitHub, email, Temporal), `rank` and `categorize` folder strategies, database index layer for query performance.

---

## Appendix A: Server Deployment Configuration

```json
{
  "mcpServers": {
    "aros": {
      "command": "npx",
      "args": ["-y", "@aros/mcp-server", "/path/to/project"],
      "env": {
        "AROS_CLAUDE_API_KEY": "...",
        "AROS_PAPERCLIP_API_URL": "https://paperclip.example.com/api",
        "AROS_PAPERCLIP_API_KEY": "sk_live_..."
      }
    }
  }
}
```

The single argument `/path/to/project` is the project root directory where all files are persisted to disk. AROS creates the directory structure on first run. Agents connect to AROS exactly as they would connect to the reference filesystem server — the protocol is identical, the semantics are extended, and the files are real.

## Appendix B: Complete Submission Flow

```
Step 1 — Write metadata:
  write_file("{project_root}/inbox/my-draft.meta.json", {...})

Step 2 — Write content (triggers pipeline):
  write_file("{project_root}/inbox/my-draft.md", content)
  → returns path: {project_root}/review/d-20260310-001/content.md

Step 3 — Poll for completion:
  read_text_file("{project_root}/review/d-20260310-001/status.json")
  → { "status": "in_review", "current_stage": "subjective", ... }

Step 4 — On revision request, read feedback:
  read_text_file("{project_root}/review/d-20260310-001/feedback.json")

Step 5 — Submit revision:
  write_file("{project_root}/revisions/d-20260310-001.md", revisedContent)
  — or for surgical edits —
  edit_file("{project_root}/revisions/d-20260310-001.md", { edits: [...], dryRun: false })

Step 6 — On approval, retrieve final content:
  read_text_file("{project_root}/approved/d-20260310-001.md")
```

## Appendix C: Human Review via Filesystem (No Dashboard Required)

```
list_directory("{project_root}/queue/human")
  → [FILE] d-20260310-001.md

read_multiple_files([
  "{project_root}/review/d-20260310-001/content.md",
  "{project_root}/review/d-20260310-001/brief.md",
  "{project_root}/review/d-20260310-001/objective_results.json",
  "{project_root}/review/d-20260310-001/subjective_results.json"
])

write_file("{project_root}/review/d-20260310-001/decision.json", {
  "decision": "approved",
  "reason": "Content meets all criteria."
})
```

A human using Claude Code or any MCP client performs the same review workflow as the dashboard, directly through filesystem tools.
