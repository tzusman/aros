# AROS — Agent Review Orchestration Service

[![CI](https://github.com/tzusman/aros/actions/workflows/ci.yml/badge.svg)](https://github.com/tzusman/aros/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

AROS is a self-hosted review pipeline for AI agent outputs. When AI agents produce work — documents, code, images, reports — AROS gives you a structured way to validate, score, and approve that work before it ships.

```
Agent produces work → Objective checks → AI scoring → Human review → Approved ✓
                              ↑                                          |
                              └──── Revision requested ←─────────────────┘
```

## Why AROS?

AI agents are increasingly autonomous, but their outputs still need oversight. AROS sits between your agents and production, providing:

- **Automated quality gates** — file size limits, format validation, word count, profanity checks
- **AI-powered scoring** — Claude evaluates deliverables against custom criteria (relevance, quality, clarity)
- **Human review dashboard** — approve, reject, or request revisions with structured feedback
- **Revision tracking** — agents receive actionable feedback and can resubmit, with full version history
- **MCP integration** — agents submit and track reviews through 10 Model Context Protocol tools

## Quick Start

```bash
# Clone and build
git clone https://github.com/tzusman/aros.git
cd aros
pnpm install
pnpm build

# Start AROS in any project directory
node cli/dist/index.js /path/to/your/project
```

On first run, AROS:
1. Creates `.aros/` directory with config, policies, and storage
2. Writes `.mcp.json` so Claude Code discovers the MCP server automatically
3. Adds AROS usage instructions to the project's `CLAUDE.md`

The server starts on port **4100** by default. Open `http://localhost:4100` for the dashboard.

## How It Works

### The Pipeline

Every deliverable moves through a configurable sequence of stages:

| Stage | What happens | Who |
|---|---|---|
| **Draft** | Agent creates review, adds files | Agent |
| **Objective** | Automated checks run (format, size, etc.) | System |
| **Subjective** | AI scores against criteria | Claude API |
| **Human** | Reviewer approves, rejects, or requests revision | Human |

If a stage fails, the deliverable enters `revision_requested` — the agent gets feedback, fixes the issues, and resubmits. Revisions re-enter the pipeline at the stage that rejected them.

Policies control which stages run, what checks apply, and how many revision attempts are allowed.

### For Agents (MCP Tools)

AROS exposes 10 MCP tools that agents use to submit and manage reviews:

```
create_review        Create a new review with title, brief, and policy
add_file             Attach files to a draft review
submit_for_review    Submit the deliverable into the pipeline
check_status         Get current stage, score, and revision number
get_feedback         Retrieve feedback after rejection or revision request
submit_revision      Replace files for a revision
complete_revision    Re-enter the pipeline after revising
list_my_reviews      Query reviews filtered by agent or stage
list_policies        List available review policies
read_file            Read a specific file from a review
```

**Typical agent workflow:**

```
create_review → add_file (×N) → submit_for_review → check_status
                                                          ↓
                                              get_feedback (if revision needed)
                                                          ↓
                                        submit_revision → complete_revision
```

### For Reviewers (Dashboard)

The web dashboard at `http://localhost:4100` provides:

- **Review workspace** — view deliverable content with objective/subjective results in context
- **Pipeline monitor** — see counts across all stages, filter and sort deliverables
- **Policy manager** — create and edit review policies with a structured editor
- **Real-time updates** — SSE-powered live refresh when deliverables change state

### For Operators (REST API)

```
GET    /api/deliverables              List deliverables (optional ?stage= filter)
GET    /api/deliverables/:id          Get full deliverable details
POST   /api/deliverables/:id/decision Submit human decision (approved/rejected/revision_requested)
GET    /api/deliverables/:id/files/:f Serve file content
GET    /api/pipeline/counts           Stage counts for dashboard cards
GET    /api/policies                  List all policies
GET    /api/policies/:name            Get policy details
PUT    /api/policies/:name            Create or update a policy
DELETE /api/policies/:name            Delete a policy
GET    /api/events                    SSE event stream
```

## Project Structure

```
aros/
├── packages/types/     Shared TypeScript types
├── server/             Express API server + pipeline engine
│   └── src/
│       ├── pipeline/   Stage processors (objective, subjective)
│       ├── routes/     REST API endpoints
│       └── __tests__/  122 unit tests
├── mcp/                MCP server (10 STDIO tools)
├── cli/                CLI entry point + project init
├── dashboard/          React web UI (Vite + Tailwind + shadcn/ui)
└── scripts/            Smoke tests
```

All AROS runtime data lives in the project's `.aros/` directory:

```
.aros/
├── config.json               Server config (port, model, etc.)
├── policies/
│   └── default.json          Review policies
├── review/
│   └── d-2026-03-12-001/     Active deliverables
│       ├── meta.json          Title, brief, policy, source agent
│       ├── status.json        Current stage, score, revision count
│       ├── content/           Submitted files
│       ├── objective.json     Check results
│       ├── subjective.json    AI score results
│       ├── feedback.json      Revision feedback
│       └── history/           Version snapshots (v1/, v2/, ...)
├── approved/                  Terminal approved deliverables
└── rejected/                  Terminal rejected deliverables
```

## Policies

Policies define what checks run, what AI criteria to evaluate, and whether human review is required. Here's the default policy:

```json
{
  "name": "default",
  "stages": ["objective", "subjective", "human"],
  "max_revisions": 3,
  "objective": {
    "checks": [
      { "name": "file_size", "config": { "max_mb": 10 }, "severity": "blocking" },
      { "name": "format_check", "config": { "allowed": ["text/*", "image/*", "application/pdf"] }, "severity": "blocking" }
    ],
    "fail_threshold": 1
  },
  "subjective": {
    "criteria": [
      { "name": "relevance", "description": "How relevant is the content to the brief", "weight": 3, "scale": 10 },
      { "name": "quality", "description": "Overall quality of the deliverable", "weight": 2, "scale": 10 },
      { "name": "clarity", "description": "Clarity and readability", "weight": 1, "scale": 10 }
    ],
    "pass_threshold": 6.0
  },
  "human": { "required": true }
}
```

### Objective Checks

| Check | Config | What it validates |
|---|---|---|
| `file_size` | `{ max_mb: 10 }` | File size under limit |
| `format_check` | `{ allowed: ["text/*"] }` | MIME type matches allowlist (supports wildcards) |
| `word_count` | `{ min: 100, max: 5000 }` | Word count within bounds |
| `image_dimensions` | `{ max_width, max_height }` | SVG/image dimension limits |
| `profanity_check` | `{ words: [...] }` | Scans text for prohibited words |

Each check has a `severity` of `blocking` (fails the deliverable) or `warning` (noted but non-fatal).

### Subjective Scoring

When an `ANTHROPIC_API_KEY` is set, AROS uses Claude to score deliverables against your criteria. Each criterion has a weight and scale — the weighted average determines pass/fail against the threshold.

Without an API key, the subjective stage is skipped automatically.

## Development

### Prerequisites

- Node.js >= 20
- pnpm 9.x

### Setup

```bash
pnpm install
pnpm build
```

### Commands

```bash
pnpm build           # Build all packages
pnpm dev             # Watch mode for all packages
pnpm typecheck       # Type-check all packages
pnpm -C server test  # Run server tests (122 tests)
```

### Smoke Test

```bash
bash scripts/smoke-test.sh
```

Starts a server, verifies all API endpoints respond correctly, checks directory structure, then cleans up.

### Running Locally

```bash
# Serve the current directory as the project
node cli/dist/index.js .

# Or specify a directory
node cli/dist/index.js /path/to/project
```

## Configuration

### Server Config (`.aros/config.json`)

```json
{
  "version": 1,
  "port": 4100,
  "subjective_model": "claude-sonnet-4-20250514"
}
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Required for subjective AI scoring. Without it, the subjective stage is skipped. |

### MCP Integration

AROS auto-configures `.mcp.json` on first run so Claude Code discovers the MCP server. To configure manually:

```json
{
  "mcpServers": {
    "aros": {
      "command": "node",
      "args": ["/path/to/aros/mcp/dist/index.js", "--project", "/path/to/project"]
    }
  }
}
```

## Notifications

AROS can notify external systems when deliverables reach terminal states. Configure notifications per-review:

```json
{
  "driver": "paperclip",
  "target": { "task_id": "task-123" },
  "events": ["approved", "revision_requested", "rejected"]
}
```

The notification driver interface is extensible — implement `send()` to integrate with any system.

## Tech Stack

- **Runtime:** Node.js 20+, TypeScript, ESM
- **Server:** Express.js
- **Agent Integration:** Model Context Protocol (MCP) via `@modelcontextprotocol/sdk`
- **AI Scoring:** Anthropic Claude API
- **Dashboard:** React 18, Vite, Tailwind CSS, shadcn/ui
- **Testing:** Vitest (122 unit tests)
- **Storage:** Filesystem (no database required)
- **Package Manager:** pnpm (monorepo with workspaces)
