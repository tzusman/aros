# Contributing to AROS

Thanks for your interest in contributing to AROS! This guide will help you get set up.

## Prerequisites

- Node.js >= 20
- pnpm 9.x (`corepack enable` to use the version pinned in package.json)

## Setup

```bash
git clone https://github.com/tzusman/aros.git
cd aros
pnpm install
pnpm build
```

## Development

```bash
pnpm dev             # Watch mode for all packages
pnpm build           # Build all packages
pnpm typecheck       # Type-check all packages
pnpm test:run        # Run all tests
pnpm -C server test  # Run server tests in watch mode
```

### Smoke test

```bash
bash scripts/smoke-test.sh
```

Starts a server, verifies all API endpoints, checks directory structure, then cleans up.

### Project structure

| Directory | What it is |
|---|---|
| `packages/types/` | Shared types, constants, and Zod validators |
| `server/` | Express API server + pipeline engine |
| `mcp/` | MCP server (STDIO tools for agents) |
| `cli/` | CLI entry point (`npx aros`) |
| `dashboard/` | React web UI |

### Branching

- `main` is the default branch
- Create feature branches for your work
- PRs target `main`

## Pull requests

1. Fork the repo and create your branch from `main`
2. Make your changes
3. Ensure `pnpm typecheck` passes
4. Ensure `pnpm test:run` passes
5. Ensure `pnpm build` succeeds
6. Open a PR with a clear description of what and why

## Reporting bugs

Open an issue using the **Bug Report** template. Include:
- Steps to reproduce
- Expected vs actual behavior
- Node.js and pnpm versions

## Requesting features

Open an issue using the **Feature Request** template. Describe the use case, not just the solution.
