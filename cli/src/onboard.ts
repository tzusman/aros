import * as fs from "node:fs";
import * as path from "node:path";
import * as cp from "node:child_process";

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
