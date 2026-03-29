# AROS

**Human review for AI agent outputs.** Agents produce work. AROS makes sure a human approves it before it ships.

```
npx -y github:tzusman/aros
```

## The Problem

AI agents are writing code, generating images, drafting emails, and producing reports autonomously. But nobody's checking the work. You either trust the output blindly or manually inspect everything the agent produces.

## What AROS Does

AROS sits between your AI agent and production. Every deliverable goes through a review pipeline:

1. **Agent submits work** via MCP tools (integrated with Claude Code)
2. **Automated checks run** — file size, format, word count, image dimensions
3. **AI scores quality** — Claude evaluates against criteria you define
4. **Human reviews** — approve, reject, or request revisions from a web dashboard

Rejected work goes back to the agent with structured feedback. The agent revises and resubmits. Full version history is preserved.

## Get Started

```bash
npx -y github:tzusman/aros
```

This starts AROS on port 4100 and opens the review dashboard. On first run it:

- Creates a `.aros/` directory for config and storage
- Registers MCP tools with Claude Code so agents can submit reviews
- Installs review policies matched to your project

No database. No cloud. Everything lives in your project directory.

## How Agents Submit Work

AROS exposes MCP tools that agents use directly in Claude Code:

```
create_review → add_file → submit_for_review → check_status → get_feedback
```

Agents can also use the single-call `submit_deliverable` to create, attach files, and submit in one step.

## Review Policies

Policies define what quality bar to enforce. AROS ships with 14 pre-built policies for common content types (blog posts, social ads, landing pages, product descriptions, etc.) and you can create custom ones.

Each policy controls:
- Which automated checks run and at what severity
- What AI scoring criteria to evaluate (with weights and thresholds)
- Whether human review is required
- How many revision attempts are allowed

## Requirements

- Node.js 20+
- `ANTHROPIC_API_KEY` for AI scoring (optional — skipped if unset)

## License

MIT
