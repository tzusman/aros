# AROS Onboarding Flow Design

**Date:** 2026-03-16
**Status:** Approved

## Summary

On first run, AROS scans the codebase using `claude --print` to recommend which registry policies to install, then generates a ready-to-paste prompt based on real files from the repo. This delivers immediate value within the first minute.

## Trigger

Part of the existing `aros` CLI flow in `cli/src/index.ts`. Runs after `storage.init()` creates `.aros/` for the first time, before the existing MCP/whitelist setup prompts. Skippable via `--no-onboard` flag (using Commander's built-in boolean negation: `.option('--onboard', 'Run smart policy onboarding', true)`) or if `claude` CLI is not available (graceful fallback — no extra policies installed beyond the default that `storage.init()` already created).

**Sequencing note:** `onboard()` runs before `firstRunSetup()`. The existing first-run detection in `index.ts` checks for `.mcp.json` and `.claude/settings.json`. Since `onboard()` does not create either of these files, the sequencing is safe — `firstRunSetup()` will still trigger. The `--no-onboard` flag only skips policy onboarding, not MCP setup.

## Flow

```
aros (first run)
  ├── storage.init()                       ← existing (creates .aros/ + default.json)
  ├── onboard(projectDir, registryDir)     ← NEW
  │   ├── scan repo (tree + README + sample files)
  │   ├── read all 14 registry policy manifests
  │   ├── spawn `claude -p` → policy recommender prompt (via stdin)
  │   ├── parse JSON response → recommended policies
  │   ├── interactive confirm (user selects/deselects via @clack/prompts)
  │   ├── install selected → copy manifests to .aros/policies/
  │   ├── gather candidate files for installed policies
  │   ├── spawn `claude -p` → prompt generator prompt (via stdin)
  │   └── print suggested prompt to terminal
  ├── firstRunSetup()                      ← existing (MCP, whitelist, CLAUDE.md)
  └── serve()                              ← existing
```

## Architecture

### LLM Invocation

Shell out to `claude` via `child_process.spawn()`, piping the prompt through stdin:

```typescript
const child = spawn("claude", [
  "-p",                          // print mode (non-interactive)
  "--output-format", "json",     // single JSON object with `result` field
  "--max-turns", "1",            // no tool use, just respond
  "--model", "haiku",            // fast + cheap for onboarding
], { stdio: ["pipe", "pipe", "pipe"] });

child.stdin.write(prompt);
child.stdin.end();

// Collect stdout, parse JSON on exit
```

Key design decisions:
- **`--output-format json`** (not `stream-json`): Returns a single JSON object with a `result` field containing the full text response. No stream parsing needed — just wait for exit and `JSON.parse(stdout)`.
- **Pipe via stdin**: The prompts can be large (repo tree + 14 policy descriptions). Passing via stdin avoids shell argument length limits. `child.stdin.write(prompt)` then `child.stdin.end()`.
- **`--model haiku`**: Onboarding doesn't need Opus/Sonnet reasoning power. Haiku is fast and cheap for structured classification tasks.
- **`--max-turns 1`**: Prevents Claude from attempting tool use during onboarding.
- No SDK dependency — uses user's existing Claude auth.
- Follows Paperclip's proven spawn pattern.

### Cost Control

Add `--max-budget-usd 0.05` to each invocation to cap runaway costs. Two Haiku calls with repo summaries should cost well under $0.01 total.

### Timeout & Spinner

Each LLM call gets a 30-second timeout enforced by killing the child process:

```typescript
const timeout = setTimeout(() => child.kill("SIGTERM"), 30_000);
child.on("exit", () => clearTimeout(timeout));
```

Display a `@clack/prompts` spinner during the wait:
```typescript
const s = prompts.spinner();
s.start("Analyzing your project...");
// ... await LLM call ...
s.stop("Found 3 recommended policies");
```

### Two LLM Calls

1. **Policy Recommender** — receives repo tree + README excerpt + sample filenames + policy catalog → returns JSON array of recommended policies with confidence and reasoning
2. **Prompt Generator** — receives installed policies + candidate files + project description → returns a ready-to-paste prompt targeting a real file or suggesting new content creation

### Registry Directory Resolution

The `registryDir` parameter is resolved relative to the CLI package's install location, not the user's project:

```typescript
const registryDir = fileURLToPath(new URL("../../registry", import.meta.url));
```

This works in development (where `registry/` is a sibling of `cli/`). For npm distribution, the `cli/package.json` `files` array must be updated to include `../../registry` or the manifests must be bundled into `cli/dist/registry/`. The simplest approach: copy `registry/policies/*/manifest.json` into `cli/dist/registry/` as part of the build step in `tsup.config.ts`.

### Repo Scanning (No LLM)

Before calling Claude, the CLI gathers:
- **Directory tree**: `fs.readdirSync` recursive, depth-limited (3 levels), excluding `.git`, `node_modules`, `dist`, `.aros`, `build`, `coverage`, `.next`, `.cache`
- **README excerpt**: First 200 lines of README.md (or README, README.txt, README.rst)
- **Sample files**: Up to 50 representative filenames from content-heavy directories. Targeted extensions: `.md`, `.html`, `.htm`, `.txt`, `.mjml`, `.png`, `.jpg`, `.jpeg`, `.svg`, `.pdf`. Prefer files from shallower directories (more likely to be primary content, not generated). Include file sizes in the output (helps the LLM distinguish a 10KB placeholder from a 50KB real blog post).

### Policy Installation

Selected policies are copied from `registry/policies/{name}/manifest.json` → `.aros/policies/{name}.json` (extracting the `policy` field from the manifest). This uses the existing `Storage.writePolicy()` method.

### Candidate File Gathering

After policies are installed, scan for files that match each policy's content type:
- Text policies (blog-post, content-article, etc.) → look for `.md`, `.html`, `.txt` files
- Image policies (instagram-ad, social-graphic, brand-asset) → look for `.png`, `.jpg`, `.svg` files
- Email policies → look for `.html` in email-related directories, `.mjml` files

### Interactive Confirmation

Use `@clack/prompts` `multiselect` (already a dependency) to show **only the recommended policies** (not all 14). All recommendations are **pre-selected** (checked by default) — the user deselects what they don't want, rather than opt-in to each one:

```typescript
const selected = await prompts.multiselect({
  message: "Recommended policies for your project:",
  options: recommendations.map(r => ({
    value: r.policy,
    label: `${r.policy} (${r.confidence})`,
    hint: r.reason,
  })),
  initialValues: recommendations.map(r => r.policy), // all pre-selected
});
```

Example display:
```
◆  Recommended policies for your project:
│
◼ content-article (high confidence)
│  src/pages/blog/ contains markdown posts — active content marketing program
◼ landing-page (high confidence)
│  src/pages/pricing.tsx and other pages are conversion-focused
◼ social-ad (medium confidence)
│  public/ads/ contains image assets that appear to be ad creatives
│
└  Press space to toggle, enter to confirm
```

### Terminal Output

After the prompt is generated, display it in a copyable block:
```
  ✔  Installed 3 policies: content-article, landing-page, social-ad

  Try this prompt in Claude Code:
  ┌────────────────────────────────────────────────────────────
  │ Review the blog post at content/blog/2024-03-seo-guide.md
  │ using AROS. Submit it with the content-article policy via
  │ submit_deliverable. If any checks fail or the subjective
  │ score is below threshold, revise and resubmit.
  └────────────────────────────────────────────────────────────
  Found an existing blog post that can go through review immediately.
```

## Prompt 1: Policy Recommender

```
You are an onboarding assistant for AROS, a review pipeline that validates AI-generated content before it reaches humans. Your job is to look at a codebase and recommend which review policies to install.

## Context

AROS has a registry of 14 review policies. Each policy defines a pipeline that checks specific content types — blog posts, ads, emails, etc. The user just ran `aros` for the first time in their project. You need to figure out what kinds of content this project produces (or will produce) and recommend the right policies.

## Available Policies

Note: At build time, this table is generated dynamically from all `registry/policies/*/manifest.json` files. The implementation reads each manifest's `name`, `description`, and `usage_hint` fields. Below is the current snapshot for reference.

| Policy | Description | When to use |
|--------|-------------|-------------|
| blog-post | SEO blog posts with word count, tone, readability, originality checks | Marketing blogs, SEO content programs |
| content-article | SEO articles, thought leadership, guides, tutorials | Blog posts, SEO articles, guides, and editorial content. Goal is organic discovery. Not for conversion or support. |
| email-campaign | Marketing emails, newsletters, drip sequences | Promotional emails, newsletters, drip sequences. Not for transactional or onboarding emails. |
| social-post | Organic social content — text posts, carousels, stories | Organic (non-paid) social — text posts, carousels, stories, threads. If paid, use social-ad. If just the graphic, use social-graphic. |
| social-ad | Paid ad creatives across Instagram, Facebook, LinkedIn, X | Paid ad creatives across any platform. Covers visual asset + ad copy. If organic, use social-post. |
| social-graphic | Social images, story graphics, cover photos, event banners | Social media images, story graphics, cover photos. Visual assets only. If there's ad copy and it's paid, use social-ad. |
| instagram-ad | Instagram-specific paid ad creatives (image + video) | Instagram-specific paid campaigns |
| landing-page | Website landing pages, product pages, pricing pages | Any web page designed to convert — product pages, pricing pages, signup pages, campaign pages. Not blogs or docs. |
| product-description | Product listings for Shopify, Amazon, own site | Product listings on own site or marketplaces (Amazon, Shopify, Etsy). Covers title, description, bullets, specs. |
| feature-announcement | Changelog entries, release notes, what's-new posts | Changelog entries, release notes, "what's new" posts. Audience already uses the product. |
| help-article | Help center docs, FAQs, knowledge base, troubleshooting | Help center docs, FAQs, knowledge base articles, troubleshooting guides. Reader has a problem to solve. |
| brand-asset | Logos, banners, icons, design system elements | Core brand materials — logos, icons, banners, design system elements. Not for social graphics or ads. |
| onboarding-sequence | Welcome emails, activation sequences, getting-started guides | Welcome emails, activation sequences, getting-started guides. Audience just signed up. |
| support-response | Customer support replies via email, chat, ticket | Support replies — email, chat, or ticket responses. Speed and resolution over polish. |

## How to Decide

**Strong signals** (recommend the policy):
- Directory names that match the content type (e.g., `blog/`, `emails/`, `ads/`, `landing-pages/`)
- Files that ARE the content type (e.g., markdown blog posts, HTML email templates, image ad creatives)
- README or docs that mention producing this type of content
- Package dependencies that indicate the content type (e.g., `mjml` → emails, `next` → landing pages)
- CI/CD or scripts for publishing this type (e.g., `deploy-blog.sh`)

**Moderate signals** (recommend but with lower confidence):
- The project is a tool or platform that HELPS users create this content (e.g., a CMS → blog-post, content-article)
- Generic marketing or content directories without clear specialization
- README mentions the content type as a future goal

**Weak signals** (do NOT recommend):
- A single stray file that doesn't represent ongoing production
- The project CONSUMES content but doesn't PRODUCE it
- Generic README mentions without supporting file structure

**Important distinctions:**
- `blog-post` vs `content-article`: blog-post is for shorter SEO posts (800-3000 words); content-article is for longer editorial/thought leadership. If both could apply, recommend content-article (it's more comprehensive).
- `social-post` vs `social-ad`: social-post is organic (free), social-ad is paid. Look for ad spend, campaign, or creative in the context.
- `social-ad` vs `instagram-ad`: instagram-ad is a specialized subset. Only recommend instagram-ad if the project is Instagram-specific; otherwise social-ad covers all platforms.
- `social-post` vs `social-graphic`: social-post includes text + optional image. social-graphic is for image-only assets (no caption). If unsure, recommend social-post.
- `email-campaign` vs `onboarding-sequence`: email-campaign is for promotional/newsletter emails. onboarding-sequence is specifically for welcome/activation flows. Check if the project has distinct onboarding vs marketing email paths.

**Default behavior:**
- Recommend 2-5 policies. Most projects need 2-3. Only recommend more if there's clear evidence.
- If the project has NO content signals at all (it's a pure library, CLI tool, or API), recommend `feature-announcement` (every software project ships releases) and note the low confidence.
- NEVER recommend all 14. That means you didn't filter.
- Order by confidence (highest first).

## Your Input

<repo_tree>
{{REPO_TREE}}
</repo_tree>

<readme>
{{README_EXCERPT}}
</readme>

<sample_files>
{{SAMPLE_FILES}}
</sample_files>

## Output Format

Return ONLY valid JSON. No markdown fencing. No explanation outside the JSON.

{
  "recommendations": [
    {
      "policy": "the-policy-name",
      "confidence": "high" | "medium" | "low",
      "reason": "One sentence explaining WHY this policy fits this specific project. Reference actual files or directories you saw."
    }
  ]
}

## Examples

### Example 1: SaaS marketing site repo

Input signals: `src/pages/blog/`, `src/pages/pricing.tsx`, `emails/welcome-sequence/`, `README: "Marketing site for Acme SaaS"`, images in `public/ads/`

{
  "recommendations": [
    {
      "policy": "content-article",
      "confidence": "high",
      "reason": "src/pages/blog/ contains markdown posts — this is an active content marketing program."
    },
    {
      "policy": "landing-page",
      "confidence": "high",
      "reason": "src/pages/pricing.tsx and other page components are conversion-focused landing pages."
    },
    {
      "policy": "onboarding-sequence",
      "confidence": "high",
      "reason": "emails/welcome-sequence/ contains a multi-step activation flow for new signups."
    },
    {
      "policy": "social-ad",
      "confidence": "medium",
      "reason": "public/ads/ contains image assets that appear to be social ad creatives."
    }
  ]
}

### Example 2: Open-source developer tool

Input signals: `docs/`, `CHANGELOG.md`, `README: "A CLI for managing Kubernetes deployments"`, no marketing content

{
  "recommendations": [
    {
      "policy": "feature-announcement",
      "confidence": "high",
      "reason": "CHANGELOG.md shows active release notes — feature-announcement will validate these before publishing."
    },
    {
      "policy": "help-article",
      "confidence": "medium",
      "reason": "docs/ contains user-facing documentation that could benefit from readability and accuracy review."
    }
  ]
}

### Example 3: E-commerce store

Input signals: `products/`, `templates/emails/`, `content/blog/`, `public/banners/`, `README: "Shopify store for handmade ceramics"`

{
  "recommendations": [
    {
      "policy": "product-description",
      "confidence": "high",
      "reason": "products/ contains Shopify product listings that need marketplace optimization and accuracy review."
    },
    {
      "policy": "email-campaign",
      "confidence": "high",
      "reason": "templates/emails/ has promotional email templates for the store's marketing campaigns."
    },
    {
      "policy": "blog-post",
      "confidence": "medium",
      "reason": "content/blog/ has short-form posts that support the store's SEO strategy."
    },
    {
      "policy": "social-graphic",
      "confidence": "medium",
      "reason": "public/banners/ contains image assets sized for social media use."
    }
  ]
}
```

## Prompt 2: Prompt Generator

```
You are an onboarding assistant for AROS. The user just installed review policies and you need to give them a ready-to-use prompt they can paste into Claude Code to immediately see AROS in action.

## Context

AROS works through MCP tools that Claude Code can call. The most important tool is `submit_deliverable`, which creates a review, attaches files, and submits them through a review pipeline (automated checks → AI subjective review → human approval).

## Your Input

<installed_policies>
{{POLICY_DETAILS}}
</installed_policies>

Note: `POLICY_DETAILS` contains the full policy JSON objects (name, description, usage_hint, stages, checks, criteria) for each installed policy — not just the names.

<candidate_files>
{{CANDIDATE_FILES}}
</candidate_files>

<project_description>
{{PROJECT_DESCRIPTION}}
</project_description>

## What to Generate

Generate a prompt the user can paste into Claude Code. The prompt should:

1. **Ask Claude to produce a specific deliverable** relevant to the project
2. **Reference a real file** from the repo when possible (to review existing content or create something inspired by it)
3. **Name the specific policy** to use for review
4. **Be self-contained** — the user pastes it and Claude does the rest

## Decision Logic

**If a candidate file directly matches a policy** (e.g., a markdown blog post exists and blog-post policy is installed):
→ Generate a prompt to review that existing file. This is the highest-value onboarding because the user sees AROS evaluate their real content.

**If candidate files are related but not a direct match** (e.g., product images exist but no product descriptions):
→ Generate a prompt to create new content inspired by the existing files. Reference the files for context.

**If no candidate files match any installed policy**:
→ Generate a prompt to create new content from scratch that fits the project. Use the project description to make it relevant.

## Output Format

Return ONLY valid JSON. No markdown fencing.

{
  "prompt": "The ready-to-paste prompt for Claude Code",
  "explanation": "One sentence explaining why you chose this prompt, so the CLI can display it to the user",
  "uses_existing_file": true | false,
  "policy": "the-policy-name-used",
  "file_referenced": "path/to/file.md" | null
}

## Examples

### Example 1: Existing blog post found

Installed policies: content-article, landing-page
Candidate files: `content/blog/2024-03-seo-guide.md` (2400 words), `src/pages/pricing.tsx`

{
  "prompt": "Review the blog post at content/blog/2024-03-seo-guide.md using AROS. Submit it with the content-article policy via submit_deliverable. If any checks fail or the subjective score is below threshold, revise the post to address the feedback and resubmit.",
  "explanation": "Found an existing blog post that can go through the content-article review pipeline immediately.",
  "uses_existing_file": true,
  "policy": "content-article",
  "file_referenced": "content/blog/2024-03-seo-guide.md"
}

### Example 2: Product images exist but no descriptions

Installed policies: product-description, social-ad
Candidate files: `products/ceramic-mug/photos/hero.jpg`, `products/ceramic-mug/photos/lifestyle.jpg`

{
  "prompt": "Write a Shopify product description for the ceramic mug shown in products/ceramic-mug/photos/hero.jpg. Look at the product photos for visual details, then create a title, description, bullet-point features list, and tags. Submit the description for review using the product-description policy via submit_deliverable.",
  "explanation": "Product photos exist but no written descriptions — generating one lets the user see the full review pipeline.",
  "uses_existing_file": false,
  "policy": "product-description",
  "file_referenced": "products/ceramic-mug/photos/hero.jpg"
}

### Example 3: Developer tool with no content files

Installed policies: feature-announcement, help-article
Candidate files: (none matching)
Project description: "CLI tool for managing Kubernetes deployments"

{
  "prompt": "Write a changelog entry announcing the latest features in this Kubernetes CLI tool. Read the recent git history to understand what changed, then write a clear, user-focused release note. Submit it for review using the feature-announcement policy via submit_deliverable.",
  "explanation": "No existing content files found, but the feature-announcement policy is perfect for a changelog entry based on recent commits.",
  "uses_existing_file": false,
  "policy": "feature-announcement",
  "file_referenced": null
}

### Example 4: Marketing site with email templates

Installed policies: email-campaign, content-article, landing-page
Candidate files: `emails/templates/spring-sale.html`, `content/blog/getting-started.md`, `src/pages/pricing.astro`

{
  "prompt": "Review the spring sale email template at emails/templates/spring-sale.html using AROS. Submit it with the email-campaign policy via submit_deliverable. If the review flags issues with subject line length, CTA clarity, or conversion potential, revise the email and resubmit.",
  "explanation": "Found an existing email template — reviewing real marketing content gives the most valuable first experience.",
  "uses_existing_file": true,
  "policy": "email-campaign",
  "file_referenced": "emails/templates/spring-sale.html"
}

## Prompt Quality Guidelines

**DO:**
- Be specific about what to create (not "write some content" but "write a changelog entry for the latest release")
- Tell Claude to use `submit_deliverable` by name — it's the one-call tool
- Name the policy explicitly
- When referencing files, use the exact path from candidate_files
- Include the revision loop: "if feedback is negative, revise and resubmit"

**DON'T:**
- Don't be vague ("try submitting something")
- Don't reference files that weren't in candidate_files
- Don't suggest policies that aren't installed
- Don't make the prompt more than 3-4 sentences
- Don't explain what AROS is in the prompt — Claude already knows via CLAUDE.md
```

## JSON Parsing

The prompts instruct the LLM to return raw JSON, but LLMs sometimes wrap responses in markdown fences anyway. Use defensive parsing:

```typescript
function parseJsonResponse(raw: string): unknown {
  // 1. Try direct parse
  try { return JSON.parse(raw); } catch {}

  // 2. Strip markdown fences and retry
  const stripped = raw.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "");
  try { return JSON.parse(stripped); } catch {}

  // 3. Extract first JSON object/array
  const match = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) {
    try { return JSON.parse(match[1]); } catch {}
  }

  return null; // all parsing failed
}
```

## Graceful Degradation

- **`claude` CLI not found**: Skip onboarding entirely. `storage.init()` already created the default policy, so no extra installation needed. Print: "Install Claude Code to enable smart policy recommendations on first run."
- **LLM call fails or times out** (30s): Skip to `firstRunSetup()`. The default policy from `init()` is sufficient.
- **LLM returns unparseable JSON**: Retry once with same prompt. If still unparseable, skip onboarding.
- **LLM returns valid JSON but no recommendations**: Skip policy installation, skip prompt generation, proceed normally.
- **User cancels `multiselect` prompt**: Install nothing extra, proceed to MCP setup.

## New Files

- `cli/src/onboard.ts` — all onboarding logic (scan, prompt, parse, install, display)

## Modified Files

- `cli/src/index.ts` — import and call `onboard()` after `storage.init()`, add `--onboard` / `--no-onboard` flag
- `cli/tsup.config.ts` (or build script) — copy `registry/policies/*/manifest.json` into `dist/registry/` for npm distribution
