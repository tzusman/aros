import * as fs from "node:fs";
import * as path from "node:path";
import * as cp from "node:child_process";
import { fileURLToPath } from "node:url";
import * as prompts from "@clack/prompts";
import pc from "picocolors";
import { Storage } from "@aros/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanResult {
  tree: string;
  readme: string;
  sampleFiles: string[];
}

export interface CallClaudeOpts {
  command?: string;
  args?: string[];
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Task 1: Repo Scanner
// ---------------------------------------------------------------------------

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".aros",
  "build",
  "coverage",
  ".next",
  ".cache",
  ".worktrees",
]);

const SAMPLE_EXTENSIONS = new Set([
  ".md",
  ".html",
  ".htm",
  ".txt",
  ".mjml",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".pdf",
]);

interface FileEntry {
  relPath: string;
  depth: number;
  size: number;
}

/**
 * Build a recursive directory tree string (depth-limited to 3 levels,
 * excluding common generated/hidden directories).
 */
function buildTree(dir: string, prefix = "", depth = 0): string {
  if (depth > 3) return "";

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return "";
  }

  // Exclude dirs we don't care about at every level
  const filtered = entries.filter((e) => !EXCLUDED_DIRS.has(e.name));
  const lines: string[] = [];

  filtered.forEach((entry, i) => {
    const isLast = i === filtered.length - 1;
    const connector = isLast ? "└── " : "├── ";
    lines.push(prefix + connector + entry.name);

    if (entry.isDirectory() && depth < 3) {
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      const subtree = buildTree(
        path.join(dir, entry.name),
        childPrefix,
        depth + 1
      );
      if (subtree) lines.push(subtree);
    }
  });

  return lines.join("\n");
}

/**
 * Collect sample files (up to 50) sorted by depth ascending.
 */
function collectSampleFiles(
  dir: string,
  base: string,
  depth = 0,
  results: FileEntry[] = []
): FileEntry[] {
  if (depth > 10) return results; // safety guard for deep trees

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(base, fullPath);

    if (entry.isDirectory()) {
      collectSampleFiles(fullPath, base, depth + 1, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SAMPLE_EXTENSIONS.has(ext)) {
        let size = 0;
        try {
          size = fs.statSync(fullPath).size;
        } catch {
          // ignore stat errors
        }
        results.push({ relPath, depth, size });
      }
    }
  }

  return results;
}

/**
 * Scan a project directory and return a tree listing, README content, and
 * sample file names with sizes.
 */
export function scanRepo(projectDir: string): ScanResult {
  // 1. Tree
  const tree = buildTree(projectDir);

  // 2. README
  let readme = "";
  const readmeCandidates = [
    "README.md",
    "README",
    "README.txt",
    "README.rst",
  ];
  for (const candidate of readmeCandidates) {
    const readmePath = path.join(projectDir, candidate);
    if (fs.existsSync(readmePath)) {
      try {
        const lines = fs
          .readFileSync(readmePath, "utf8")
          .split("\n")
          .slice(0, 200);
        readme = lines.join("\n");
      } catch {
        // ignore read errors
      }
      break;
    }
  }

  // 3. Sample files — sorted by depth ascending, then capped at 50
  const allFiles = collectSampleFiles(projectDir, projectDir);
  allFiles.sort((a, b) => a.depth - b.depth || a.relPath.localeCompare(b.relPath));
  const sampleFiles = allFiles
    .slice(0, 50)
    .map((f) => `${f.relPath} (${f.size} bytes)`);

  return { tree, readme, sampleFiles };
}

// ---------------------------------------------------------------------------
// Task 2: LLM Caller
// ---------------------------------------------------------------------------

const DEFAULT_CLAUDE_ARGS = [
  "-p",
  "--output-format",
  "json",
  "--max-turns",
  "1",
  "--model",
  "haiku",
  "--max-budget-usd",
  "0.05",
];

/**
 * Call the `claude` CLI with the given prompt and return its stdout, or null
 * on any error (spawn failure, non-zero exit, timeout).
 */
export function callClaude(
  prompt: string,
  opts: CallClaudeOpts = {}
): Promise<string | null> {
  const command = opts.command ?? "claude";
  const args = opts.args ?? DEFAULT_CLAUDE_ARGS;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  return new Promise((resolve) => {
    let child: cp.ChildProcess;

    try {
      child = cp.spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      resolve(null);
      return;
    }

    let stdout = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut || code !== 0) {
        resolve(null);
      } else {
        resolve(stdout);
      }
    });

    try {
      child.stdin?.write(prompt);
      child.stdin?.end();
    } catch {
      clearTimeout(timer);
      child.kill("SIGTERM");
      resolve(null);
    }
  });
}

// ---------------------------------------------------------------------------
// Task 3: JSON Parser
// ---------------------------------------------------------------------------

/**
 * Attempt to parse a raw string as JSON using three strategies:
 * 1. Direct JSON.parse
 * 2. Strip markdown fences and retry
 * 3. Extract first JSON object/array via regex and retry
 *
 * Returns the parsed value or null if all strategies fail.
 */
export function parseJsonResponse(raw: string): unknown {
  // Step 1: direct parse
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }

  // Step 2: strip markdown fences
  const stripped = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  try {
    return JSON.parse(stripped);
  } catch {
    // continue
  }

  // Step 3: extract first JSON object or array via regex
  const match = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // fall through
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Task 4: Registry Manifest Reader
// ---------------------------------------------------------------------------

export interface RegistryPolicy {
  name: string;
  description: string;
  usageHint: string;
  policy: Record<string, unknown>;
}

/**
 * Read all registry policy manifests from {registryDir}/policies/{name}/manifest.json
 * and return an array of RegistryPolicy objects.
 * Returns an empty array if the directory doesn't exist or no manifests are found.
 * Silently skips malformed manifests.
 */
export function loadRegistryPolicies(registryDir: string): RegistryPolicy[] {
  const policiesDir = path.join(registryDir, "policies");

  if (!fs.existsSync(policiesDir)) {
    return [];
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(policiesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: RegistryPolicy[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = path.join(policiesDir, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const parsed = JSON.parse(raw);

      // Validate required fields
      if (
        typeof parsed.name !== "string" ||
        typeof parsed.description !== "string" ||
        typeof parsed.policy !== "object" ||
        parsed.policy === null
      ) {
        continue;
      }

      results.push({
        name: parsed.name,
        description: parsed.description,
        usageHint:
          typeof parsed.usage_hint === "string"
            ? parsed.usage_hint
            : parsed.description,
        policy: parsed.policy as Record<string, unknown>,
      });
    } catch {
      // Silently skip malformed manifests
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Task 5: Policy Installer
// ---------------------------------------------------------------------------

/**
 * Install selected policies into storage from registry manifests.
 * Returns an array of the names that were actually installed.
 * Skips names that are not found in registryPolicies.
 */
export async function installPolicies(
  storage: Storage,
  selectedNames: string[],
  registryPolicies: RegistryPolicy[]
): Promise<string[]> {
  const policyMap = new Map(registryPolicies.map((r) => [r.name, r]));
  const installed: string[] = [];

  for (const name of selectedNames) {
    const reg = policyMap.get(name);
    if (!reg) continue;

    await storage.writePolicy(name, reg.policy as any);
    installed.push(name);
  }

  return installed;
}

// ---------------------------------------------------------------------------
// Task 6: Recommender Prompt Builder
// ---------------------------------------------------------------------------

const RECOMMENDER_PROMPT_TEMPLATE = `You are an onboarding assistant for AROS, a review pipeline that validates AI-generated content before it reaches humans. Your job is to look at a codebase and recommend which review policies to install.

## Context

AROS has a registry of 14 review policies. Each policy defines a pipeline that checks specific content types — blog posts, ads, emails, etc. The user just ran \`aros\` for the first time in their project. You need to figure out what kinds of content this project produces (or will produce) and recommend the right policies.

## Available Policies

Note: At build time, this table is generated dynamically from all \`registry/policies/*/manifest.json\` files. The implementation reads each manifest's \`name\`, \`description\`, and \`usage_hint\` fields. Below is the current snapshot for reference.

| Policy | Description | When to use |
|--------|-------------|-------------|
{{POLICY_TABLE}}

## How to Decide

**Strong signals** (recommend the policy):
- Directory names that match the content type (e.g., \`blog/\`, \`emails/\`, \`ads/\`, \`landing-pages/\`)
- Files that ARE the content type (e.g., markdown blog posts, HTML email templates, image ad creatives)
- README or docs that mention producing this type of content
- Package dependencies that indicate the content type (e.g., \`mjml\` → emails, \`next\` → landing pages)
- CI/CD or scripts for publishing this type (e.g., \`deploy-blog.sh\`)

**Moderate signals** (recommend but with lower confidence):
- The project is a tool or platform that HELPS users create this content (e.g., a CMS → blog-post, content-article)
- Generic marketing or content directories without clear specialization
- README mentions the content type as a future goal

**Weak signals** (do NOT recommend):
- A single stray file that doesn't represent ongoing production
- The project CONSUMES content but doesn't PRODUCE it
- Generic README mentions without supporting file structure

**Important distinctions:**
- \`blog-post\` vs \`content-article\`: blog-post is for shorter SEO posts (800-3000 words); content-article is for longer editorial/thought leadership. If both could apply, recommend content-article (it's more comprehensive).
- \`social-post\` vs \`social-ad\`: social-post is organic (free), social-ad is paid. Look for ad spend, campaign, or creative in the context.
- \`social-ad\` vs \`instagram-ad\`: instagram-ad is a specialized subset. Only recommend instagram-ad if the project is Instagram-specific; otherwise social-ad covers all platforms.
- \`social-post\` vs \`social-graphic\`: social-post includes text + optional image. social-graphic is for image-only assets (no caption). If unsure, recommend social-post.
- \`email-campaign\` vs \`onboarding-sequence\`: email-campaign is for promotional/newsletter emails. onboarding-sequence is specifically for welcome/activation flows. Check if the project has distinct onboarding vs marketing email paths.

**Default behavior:**
- Recommend 2-5 policies. Most projects need 2-3. Only recommend more if there's clear evidence.
- If the project has NO content signals at all (it's a pure library, CLI tool, or API), recommend \`feature-announcement\` (every software project ships releases) and note the low confidence.
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

Input signals: \`src/pages/blog/\`, \`src/pages/pricing.tsx\`, \`emails/welcome-sequence/\`, \`README: "Marketing site for Acme SaaS"\`, images in \`public/ads/\`

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

Input signals: \`docs/\`, \`CHANGELOG.md\`, \`README: "A CLI for managing Kubernetes deployments"\`, no marketing content

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

Input signals: \`products/\`, \`templates/emails/\`, \`content/blog/\`, \`public/banners/\`, \`README: "Shopify store for handmade ceramics"\`

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
}`;

/**
 * Build the Policy Recommender prompt from scan results and registry policies.
 */
export function buildRecommenderPrompt(
  scan: ScanResult,
  registryPolicies: RegistryPolicy[]
): string {
  // Build policy table rows
  const policyTable = registryPolicies
    .map((r) => `| ${r.name} | ${r.description} | ${r.usageHint} |`)
    .join("\n");

  return RECOMMENDER_PROMPT_TEMPLATE.replace("{{POLICY_TABLE}}", policyTable)
    .replace("{{REPO_TREE}}", scan.tree)
    .replace("{{README_EXCERPT}}", scan.readme)
    .replace("{{SAMPLE_FILES}}", scan.sampleFiles.join("\n"));
}

// ---------------------------------------------------------------------------
// Task 7: Candidate File Gatherer
// ---------------------------------------------------------------------------

const TEXT_POLICY_NAMES = new Set([
  "blog-post",
  "content-article",
  "feature-announcement",
  "help-article",
  "landing-page",
  "product-description",
  "support-response",
  "onboarding-sequence",
]);

const IMAGE_POLICY_NAMES = new Set([
  "instagram-ad",
  "social-ad",
  "social-graphic",
  "brand-asset",
]);

const EMAIL_POLICY_NAMES = new Set(["email-campaign", "onboarding-sequence"]);

const SOCIAL_POLICY_NAMES = new Set(["social-post"]);

const TEXT_EXTENSIONS = new Set([".md", ".html", ".htm", ".txt"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg"]);
const EMAIL_EXTENSIONS = new Set([".html", ".htm", ".mjml"]);
const EMAIL_DIR_KEYWORDS = new Set([
  "email",
  "emails",
  "newsletter",
  "drip",
  "campaign",
  "templates",
]);

/**
 * Determine allowed extensions for candidate file gathering based on installed policies.
 */
function getAllowedExtensions(installedPolicyNames: string[]): {
  text: boolean;
  image: boolean;
  email: boolean;
  social: boolean;
} {
  return {
    text: installedPolicyNames.some((n) => TEXT_POLICY_NAMES.has(n)),
    image: installedPolicyNames.some((n) => IMAGE_POLICY_NAMES.has(n)),
    email: installedPolicyNames.some((n) => EMAIL_POLICY_NAMES.has(n)),
    social: installedPolicyNames.some((n) => SOCIAL_POLICY_NAMES.has(n)),
  };
}

function isEmailDir(dirPath: string): boolean {
  const parts = dirPath.split(path.sep);
  return parts.some((p) => EMAIL_DIR_KEYWORDS.has(p.toLowerCase()));
}

function collectCandidateFiles(
  dir: string,
  base: string,
  policyFlags: ReturnType<typeof getAllowedExtensions>,
  results: string[],
  depth = 0
): void {
  if (results.length >= 20) return;
  if (depth > 10) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= 20) break;
    if (EXCLUDED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(base, fullPath);

    if (entry.isDirectory()) {
      collectCandidateFiles(fullPath, base, policyFlags, results, depth + 1);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();

      // Text policies: .md, .html, .htm, .txt
      if (policyFlags.text && TEXT_EXTENSIONS.has(ext)) {
        results.push(relPath);
        continue;
      }

      // Image policies: .png, .jpg, .jpeg, .svg
      if (policyFlags.image && IMAGE_EXTENSIONS.has(ext)) {
        results.push(relPath);
        continue;
      }

      // Email policies: .html, .htm, .mjml in email-related dirs
      if (policyFlags.email && EMAIL_EXTENSIONS.has(ext)) {
        if (ext === ".mjml" || isEmailDir(path.join(dir, entry.name))) {
          results.push(relPath);
          continue;
        }
      }

      // Social policies: text + image extensions
      if (
        policyFlags.social &&
        (TEXT_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext))
      ) {
        results.push(relPath);
        continue;
      }
    }
  }
}

/**
 * Gather candidate files from the project directory based on installed policy types.
 * Returns at most 20 file paths.
 */
export function gatherCandidateFiles(
  projectDir: string,
  installedPolicyNames: string[]
): string[] {
  const policyFlags = getAllowedExtensions(installedPolicyNames);
  const results: string[] = [];
  collectCandidateFiles(projectDir, projectDir, policyFlags, results);
  return results;
}

// ---------------------------------------------------------------------------
// Task 8: Prompt Generator Builder
// ---------------------------------------------------------------------------

const PROMPT_GENERATOR_TEMPLATE = `You are an onboarding assistant for AROS. The user just installed review policies and you need to give them a ready-to-use prompt they can paste into Claude Code to immediately see AROS in action.

## Context

AROS works through MCP tools that Claude Code can call. The most important tool is \`submit_deliverable\`, which creates a review, attaches files, and submits them through a review pipeline (automated checks → AI subjective review → human approval).

## Your Input

<installed_policies>
{{POLICY_DETAILS}}
</installed_policies>

Note: \`POLICY_DETAILS\` contains the full policy JSON objects (name, description, usage_hint, stages, checks, criteria) for each installed policy — not just the names.

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
Candidate files: \`content/blog/2024-03-seo-guide.md\` (2400 words), \`src/pages/pricing.tsx\`

{
  "prompt": "Review the blog post at content/blog/2024-03-seo-guide.md using AROS. Submit it with the content-article policy via submit_deliverable. If any checks fail or the subjective score is below threshold, revise the post to address the feedback and resubmit.",
  "explanation": "Found an existing blog post that can go through the content-article review pipeline immediately.",
  "uses_existing_file": true,
  "policy": "content-article",
  "file_referenced": "content/blog/2024-03-seo-guide.md"
}

### Example 2: Product images exist but no descriptions

Installed policies: product-description, social-ad
Candidate files: \`products/ceramic-mug/photos/hero.jpg\`, \`products/ceramic-mug/photos/lifestyle.jpg\`

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
Candidate files: \`emails/templates/spring-sale.html\`, \`content/blog/getting-started.md\`, \`src/pages/pricing.astro\`

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
- Tell Claude to use \`submit_deliverable\` by name — it's the one-call tool
- Name the policy explicitly
- When referencing files, use the exact path from candidate_files
- Include the revision loop: "if feedback is negative, revise and resubmit"

**DON'T:**
- Don't be vague ("try submitting something")
- Don't reference files that weren't in candidate_files
- Don't suggest policies that aren't installed
- Don't make the prompt more than 3-4 sentences
- Don't explain what AROS is in the prompt — Claude already knows via CLAUDE.md`;

/**
 * Build the Prompt Generator prompt from installed policies, candidate files, and project description.
 */
export function buildPromptGeneratorPrompt(
  installedPolicies: RegistryPolicy[],
  candidateFiles: string[],
  projectDescription: string
): string {
  const policyDetails = JSON.stringify(
    installedPolicies.map((p) => ({
      name: p.name,
      description: p.description,
      usage_hint: p.usageHint,
      policy: p.policy,
    })),
    null,
    2
  );

  return PROMPT_GENERATOR_TEMPLATE.replace("{{POLICY_DETAILS}}", policyDetails)
    .replace("{{CANDIDATE_FILES}}", candidateFiles.join("\n"))
    .replace("{{PROJECT_DESCRIPTION}}", projectDescription);
}

// ---------------------------------------------------------------------------
// Task 9: Main Orchestrator
// ---------------------------------------------------------------------------

export interface OnboardResult {
  installedPolicies: string[];
  suggestedPrompt: string | null;
  suggestedExplanation: string | null;
}

/**
 * Resolve the registry directory by trying candidate paths relative to this
 * file's location. Returns the first directory that contains a `policies/`
 * subdirectory, or null if none is found.
 */
function resolveRegistryDir(): string | null {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const candidates = [
    path.resolve(here, "registry"),          // bundled: cli/dist/registry/
    path.resolve(here, "../../registry"),    // dev: cli/src/ → registry/
    path.resolve(here, "../registry"),       // alt bundled layout
    path.resolve(here, "../../../registry"), // monorepo root
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "policies"))) {
      return candidate;
    }
  }

  return null;
}

/**
 * Print the suggested prompt in a bordered box with the explanation below.
 */
function printSuggestedPrompt(prompt: string, explanation: string | null): void {
  const width = 72;
  const border = pc.cyan("─".repeat(width));
  const lines = prompt.match(/.{1,68}/g) ?? [prompt];

  console.log();
  console.log(pc.cyan("┌" + "─".repeat(width) + "┐"));
  for (const line of lines) {
    const padding = " ".repeat(Math.max(0, width - line.length));
    console.log(pc.cyan("│ ") + line + padding + pc.cyan(" │"));
  }
  console.log(pc.cyan("└" + "─".repeat(width) + "┘"));

  if (explanation) {
    console.log();
    console.log("  " + pc.dim(explanation));
  }
  console.log();
}

const DEMO_STARTER_PROMPT = `Submit the two demo SVGs for review through AROS:

1. Submit .aros/demo/image-one.svg
2. Submit .aros/demo/image-two.svg

Use the AROS MCP tools (create_review, add_file, submit_for_review) to send each one.`;

/**
 * Copy bundled demo SVGs into the project's .aros/demo/ directory.
 */
export function installDemoFiles(projectDir: string): void {
  const demoDir = path.join(projectDir, ".aros", "demo");
  if (!fs.existsSync(demoDir)) {
    fs.mkdirSync(demoDir, { recursive: true });
  }

  const here = fileURLToPath(new URL(".", import.meta.url));
  const bundledDemo = path.resolve(here, "demo");

  // If bundled demo files exist, copy them
  if (fs.existsSync(bundledDemo)) {
    for (const name of ["image-one.svg", "image-two.svg"]) {
      const src = path.join(bundledDemo, name);
      const dest = path.join(demoDir, name);
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
      }
    }
  }
}

interface OnboardOptions {
  skipDemo?: boolean;
}

/**
 * Main onboarding orchestrator. Installs policies from the registry
 * and optionally copies demo SVG files.
 */
export async function onboard(
  projectDir: string,
  storage: Storage,
  opts: OnboardOptions = {},
): Promise<OnboardResult> {
  const result: OnboardResult = {
    installedPolicies: [],
    suggestedPrompt: null,
    suggestedExplanation: null,
  };

  // Install registry policies
  const registryDir = resolveRegistryDir();
  if (registryDir) {
    let registryPolicies: RegistryPolicy[];
    try {
      registryPolicies = loadRegistryPolicies(registryDir);
    } catch {
      registryPolicies = [];
    }

    if (registryPolicies.length > 0) {
      const allNames = registryPolicies.map((p) => p.name);
      try {
        result.installedPolicies = await installPolicies(storage, allNames, registryPolicies);
      } catch {
        result.installedPolicies = [];
      }
    }
  }

  // Copy demo SVGs
  if (!opts.skipDemo) {
    installDemoFiles(projectDir);
  }

  return result;
}
