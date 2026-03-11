## Git Workflow

**The main project directory (`/Users/tzusman/Documents/projects/aros`) must always stay on the `main` branch.** All feature/topic branches must live in git worktrees, not in this directory. Never switch branches in the project folder — use `git worktree add` to create an isolated working directory for any branch work.

### Git Commands in Other Directories
**Never use `cd <dir> && git ...` compound commands** — they trigger a permission prompt for bare repository attack prevention. Instead, use `git -C <path>` for ALL git commands (status, add, commit, diff, log, etc.):
```bash
# BAD — triggers permission prompt
cd .worktrees/my-branch && git add file.ts
cd .worktrees/my-branch && git status

# GOOD — already allowed
git -C .worktrees/my-branch add file.ts
git -C .worktrees/my-branch status
git -C .worktrees/my-branch diff
```

### Git Commit Messages
**Never use `$(...)` command substitution in git commit commands** — it triggers a permission prompt. Instead, pipe a heredoc into `git commit` via `-F -`:
```bash
git commit -F - <<'EOF'
Your commit message here.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
```

## AROS Review Pipeline

This project uses AROS for AI deliverable review. When you produce work products (documents, code artifacts, images) that need human review, submit them through the AROS MCP tools:

1. `create_review` → `add_file` → `submit_for_review` to submit work
2. `check_status` / `get_feedback` to check on reviews
3. `submit_revision` → `complete_revision` if revisions are requested

The AROS server must be running for the MCP tools to work.
