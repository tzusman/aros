import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  scanRepo,
  callClaude,
  parseJsonResponse,
  loadRegistryPolicies,
  installPolicies,
  buildRecommenderPrompt,
  gatherCandidateFiles,
  buildPromptGeneratorPrompt,
  type RegistryPolicy,
  type ScanResult,
} from "../onboard.js";
import { Storage } from "@aros/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aros-onboard-test-"));
}

function rmTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// scanRepo()
// ---------------------------------------------------------------------------

describe("scanRepo()", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkTmpDir();
  });

  afterEach(() => {
    rmTmpDir(tmpDir);
  });

  it("returns empty tree, readme, and sampleFiles for an empty directory", () => {
    const result = scanRepo(tmpDir);
    expect(result.tree).toBe("");
    expect(result.readme).toBe("");
    expect(result.sampleFiles).toEqual([]);
  });

  it("builds a tree listing with files and nested directories", () => {
    fs.writeFileSync(path.join(tmpDir, "README.md"), "# Hello");
    fs.mkdirSync(path.join(tmpDir, "src"));
    fs.writeFileSync(path.join(tmpDir, "src", "index.ts"), "");
    fs.mkdirSync(path.join(tmpDir, "src", "utils"));
    fs.writeFileSync(path.join(tmpDir, "src", "utils", "helper.ts"), "");

    const result = scanRepo(tmpDir);
    expect(result.tree).toContain("README.md");
    expect(result.tree).toContain("src");
    expect(result.tree).toContain("index.ts");
    expect(result.tree).toContain("utils");
    expect(result.tree).toContain("helper.ts");
  });

  it("excludes node_modules, .git, dist, .aros, build, coverage, .next, .cache, .worktrees", () => {
    const excludedDirs = [
      "node_modules",
      ".git",
      "dist",
      ".aros",
      "build",
      "coverage",
      ".next",
      ".cache",
      ".worktrees",
    ];
    for (const d of excludedDirs) {
      fs.mkdirSync(path.join(tmpDir, d));
      fs.writeFileSync(path.join(tmpDir, d, "file.txt"), "secret");
    }
    fs.writeFileSync(path.join(tmpDir, "visible.md"), "# Visible");

    const result = scanRepo(tmpDir);
    for (const d of excludedDirs) {
      expect(result.tree).not.toContain(d);
    }
    expect(result.tree).toContain("visible.md");
  });

  it("limits tree depth to 3 levels", () => {
    // Create a 4-level deep structure: a/b/c/d/deep.ts
    const deep = path.join(tmpDir, "a", "b", "c", "d");
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, "deep.ts"), "");

    const result = scanRepo(tmpDir);
    // "deep.ts" lives at depth 4 — should not appear in tree
    expect(result.tree).not.toContain("deep.ts");
    // Parent dirs at depth <= 3 should still appear
    expect(result.tree).toContain("a");
    expect(result.tree).toContain("b");
    expect(result.tree).toContain("c");
  });

  describe("readme", () => {
    it("reads README.md and returns first 200 lines", () => {
      const lines = Array.from({ length: 250 }, (_, i) => `Line ${i + 1}`);
      fs.writeFileSync(path.join(tmpDir, "README.md"), lines.join("\n"));

      const result = scanRepo(tmpDir);
      const resultLines = result.readme.split("\n");
      expect(resultLines).toHaveLength(200);
      expect(resultLines[0]).toBe("Line 1");
      expect(resultLines[199]).toBe("Line 200");
    });

    it("falls back to README (no extension)", () => {
      fs.writeFileSync(path.join(tmpDir, "README"), "plain readme");
      const result = scanRepo(tmpDir);
      expect(result.readme).toBe("plain readme");
    });

    it("falls back to README.txt", () => {
      fs.writeFileSync(path.join(tmpDir, "README.txt"), "txt readme");
      const result = scanRepo(tmpDir);
      expect(result.readme).toBe("txt readme");
    });

    it("falls back to README.rst", () => {
      fs.writeFileSync(path.join(tmpDir, "README.rst"), "rst readme");
      const result = scanRepo(tmpDir);
      expect(result.readme).toBe("rst readme");
    });

    it("prefers README.md over other readme variants", () => {
      fs.writeFileSync(path.join(tmpDir, "README.md"), "markdown");
      fs.writeFileSync(path.join(tmpDir, "README.txt"), "text");
      const result = scanRepo(tmpDir);
      expect(result.readme).toBe("markdown");
    });

    it("returns empty string when no readme exists", () => {
      const result = scanRepo(tmpDir);
      expect(result.readme).toBe("");
    });
  });

  describe("sampleFiles", () => {
    it("collects only files with allowed extensions", () => {
      const allowed = ["doc.md", "page.html", "file.htm", "notes.txt", "mail.mjml",
                       "img.png", "photo.jpg", "photo2.jpeg", "icon.svg", "report.pdf"];
      const disallowed = ["script.ts", "style.css", "app.js", "data.json"];

      for (const f of [...allowed, ...disallowed]) {
        fs.writeFileSync(path.join(tmpDir, f), "x");
      }

      const result = scanRepo(tmpDir);
      const names = result.sampleFiles.map((s) => s.split(" ")[0]);

      for (const f of allowed) {
        expect(names).toContain(f);
      }
      for (const f of disallowed) {
        expect(names).not.toContain(f);
      }
    });

    it("formats entries as 'relPath (N bytes)'", () => {
      const content = "hello world";
      fs.writeFileSync(path.join(tmpDir, "notes.txt"), content);

      const result = scanRepo(tmpDir);
      expect(result.sampleFiles).toHaveLength(1);
      expect(result.sampleFiles[0]).toBe(
        `notes.txt (${Buffer.byteLength(content)} bytes)`
      );
    });

    it("returns at most 50 files", () => {
      for (let i = 0; i < 60; i++) {
        fs.writeFileSync(path.join(tmpDir, `file${i}.md`), "x");
      }
      const result = scanRepo(tmpDir);
      expect(result.sampleFiles).toHaveLength(50);
    });

    it("prefers shallow files (depth 0 before depth 1)", () => {
      fs.mkdirSync(path.join(tmpDir, "sub"));
      fs.writeFileSync(path.join(tmpDir, "shallow.md"), "root");
      fs.writeFileSync(path.join(tmpDir, "sub", "deep.md"), "nested");

      const result = scanRepo(tmpDir);
      const names = result.sampleFiles.map((s) => s.split(" ")[0]);
      expect(names.indexOf("shallow.md")).toBeLessThan(
        names.indexOf("sub/deep.md")
      );
    });

    it("excludes files inside excluded directories", () => {
      fs.mkdirSync(path.join(tmpDir, "node_modules"));
      fs.writeFileSync(path.join(tmpDir, "node_modules", "pkg.md"), "x");
      fs.writeFileSync(path.join(tmpDir, "real.md"), "visible");

      const result = scanRepo(tmpDir);
      const names = result.sampleFiles.map((s) => s.split(" ")[0]);
      expect(names).not.toContain("node_modules/pkg.md");
      expect(names).toContain("real.md");
    });
  });
});

// ---------------------------------------------------------------------------
// callClaude()
// ---------------------------------------------------------------------------

describe("callClaude()", () => {
  it("returns null when command is not found", async () => {
    const result = await callClaude("hello", {
      command: "nonexistent-binary-xyz",
    });
    expect(result).toBeNull();
  });

  it("returns null when the process times out", async () => {
    const result = await callClaude("hello", {
      command: "sleep",
      args: ["10"],
      timeoutMs: 100,
    });
    expect(result).toBeNull();
  }, 5000);
});

// ---------------------------------------------------------------------------
// parseJsonResponse()
// ---------------------------------------------------------------------------

describe("parseJsonResponse()", () => {
  it("parses a plain JSON object directly", () => {
    const result = parseJsonResponse('{"key": "value"}');
    expect(result).toEqual({ key: "value" });
  });

  it("parses a plain JSON array directly", () => {
    const result = parseJsonResponse("[1, 2, 3]");
    expect(result).toEqual([1, 2, 3]);
  });

  it("parses JSON wrapped in ```json fences", () => {
    const raw = '```json\n{"key": "value"}\n```';
    expect(parseJsonResponse(raw)).toEqual({ key: "value" });
  });

  it("parses JSON wrapped in plain ``` fences", () => {
    const raw = '```\n{"key": "value"}\n```';
    expect(parseJsonResponse(raw)).toEqual({ key: "value" });
  });

  it("extracts JSON object embedded in prose", () => {
    const raw = 'Here is the result: {"score": 42} as requested.';
    expect(parseJsonResponse(raw)).toEqual({ score: 42 });
  });

  it("extracts JSON array embedded in prose", () => {
    const raw = 'The items are: [1, 2, 3] in the list.';
    expect(parseJsonResponse(raw)).toEqual([1, 2, 3]);
  });

  it("returns null for completely non-JSON input", () => {
    expect(parseJsonResponse("This is just plain text.")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseJsonResponse("")).toBeNull();
  });

  it("returns null for malformed JSON that cannot be rescued", () => {
    expect(parseJsonResponse("{not valid json")).toBeNull();
  });

  it("handles nested JSON objects", () => {
    const raw = '{"a": {"b": [1, 2, 3]}}';
    expect(parseJsonResponse(raw)).toEqual({ a: { b: [1, 2, 3] } });
  });

  it("handles JSON with unicode and special characters", () => {
    const raw = '{"emoji": "🎉", "quote": "say \\"hi\\""}';
    expect(parseJsonResponse(raw)).toEqual({ emoji: "🎉", quote: 'say "hi"' });
  });
});

// ---------------------------------------------------------------------------
// loadRegistryPolicies()
// ---------------------------------------------------------------------------

describe("loadRegistryPolicies()", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkTmpDir();
  });

  afterEach(() => {
    rmTmpDir(tmpDir);
  });

  function createManifest(
    registryDir: string,
    policyName: string,
    manifest: Record<string, unknown>
  ): void {
    const dir = path.join(registryDir, "policies", policyName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  }

  it("reads manifests from registry dir", () => {
    createManifest(tmpDir, "blog-post", {
      name: "blog-post",
      description: "SEO blog posts",
      usage_hint: "Use for blog posts",
      policy: { name: "blog-post", stages: ["objective"] },
    });

    const result = loadRegistryPolicies(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("blog-post");
  });

  it("includes description and usageHint", () => {
    createManifest(tmpDir, "content-article", {
      name: "content-article",
      description: "SEO articles and guides",
      usage_hint: "Use for editorial content",
      policy: { name: "content-article", stages: ["objective", "subjective"] },
    });

    const result = loadRegistryPolicies(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("SEO articles and guides");
    expect(result[0].usageHint).toBe("Use for editorial content");
  });

  it("falls back to description when usage_hint is absent", () => {
    createManifest(tmpDir, "landing-page", {
      name: "landing-page",
      description: "Landing pages for conversion",
      policy: { name: "landing-page", stages: ["objective"] },
    });

    const result = loadRegistryPolicies(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].usageHint).toBe("Landing pages for conversion");
  });

  it("returns empty array for nonexistent dir", () => {
    const result = loadRegistryPolicies("/nonexistent/path/xyz");
    expect(result).toEqual([]);
  });

  it("skips malformed manifests silently", () => {
    // Valid manifest
    createManifest(tmpDir, "good-policy", {
      name: "good-policy",
      description: "A good policy",
      usage_hint: "Use it well",
      policy: { name: "good-policy", stages: [] },
    });

    // Malformed JSON
    const badDir = path.join(tmpDir, "policies", "bad-policy");
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, "manifest.json"), "not json {{{");

    // Missing required field
    createManifest(tmpDir, "missing-name", {
      description: "Has description but no name",
      policy: { stages: [] },
    });

    const result = loadRegistryPolicies(tmpDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("good-policy");
  });
});

// ---------------------------------------------------------------------------
// installPolicies()
// ---------------------------------------------------------------------------

describe("installPolicies()", () => {
  let tmpDir: string;
  let storage: Storage;

  beforeEach(async () => {
    tmpDir = mkTmpDir();
    storage = new Storage(tmpDir);
    await storage.init();
  });

  afterEach(() => {
    rmTmpDir(tmpDir);
  });

  const sampleRegistryPolicies: RegistryPolicy[] = [
    {
      name: "content-article",
      description: "SEO articles",
      usageHint: "Use for editorial content",
      policy: {
        name: "content-article",
        stages: ["objective", "subjective", "human"],
        max_revisions: 3,
      } as Record<string, unknown>,
    },
    {
      name: "landing-page",
      description: "Landing pages",
      usageHint: "Use for conversion pages",
      policy: {
        name: "landing-page",
        stages: ["objective", "human"],
        max_revisions: 2,
      } as Record<string, unknown>,
    },
  ];

  it("writes selected policies to .aros/policies/", async () => {
    const installed = await installPolicies(
      storage,
      ["content-article"],
      sampleRegistryPolicies
    );

    expect(installed).toEqual(["content-article"]);

    const policies = await storage.listPolicies();
    expect(policies).toContain("content-article");

    const written = await storage.readPolicy("content-article");
    expect(written.name).toBe("content-article");
  });

  it("skips unknown policies", async () => {
    const installed = await installPolicies(
      storage,
      ["unknown-policy", "content-article"],
      sampleRegistryPolicies
    );

    expect(installed).toEqual(["content-article"]);
    expect(installed).not.toContain("unknown-policy");
  });

  it("default policy still present after install", async () => {
    await installPolicies(
      storage,
      ["content-article", "landing-page"],
      sampleRegistryPolicies
    );

    const policies = await storage.listPolicies();
    expect(policies).toContain("default");
  });
});

// ---------------------------------------------------------------------------
// buildRecommenderPrompt()
// ---------------------------------------------------------------------------

describe("buildRecommenderPrompt()", () => {
  const scan: ScanResult = {
    tree: "├── src\n│   └── index.ts\n└── README.md",
    readme: "# My Project\nA test project for AROS onboarding.",
    sampleFiles: ["content/blog/post.md (1200 bytes)", "public/hero.png (45000 bytes)"],
  };

  const registryPolicies: RegistryPolicy[] = [
    {
      name: "content-article",
      description: "SEO articles and guides",
      usageHint: "Use for editorial content",
      policy: {},
    },
    {
      name: "landing-page",
      description: "Landing pages",
      usageHint: "Use for conversion pages",
      policy: {},
    },
  ];

  it("includes repo tree in output", () => {
    const prompt = buildRecommenderPrompt(scan, registryPolicies);
    expect(prompt).toContain(scan.tree);
  });

  it("includes readme in output", () => {
    const prompt = buildRecommenderPrompt(scan, registryPolicies);
    expect(prompt).toContain(scan.readme);
  });

  it("includes sample files in output", () => {
    const prompt = buildRecommenderPrompt(scan, registryPolicies);
    expect(prompt).toContain("content/blog/post.md (1200 bytes)");
    expect(prompt).toContain("public/hero.png (45000 bytes)");
  });

  it("includes policy table with all entries", () => {
    const prompt = buildRecommenderPrompt(scan, registryPolicies);
    expect(prompt).toContain("content-article");
    expect(prompt).toContain("SEO articles and guides");
    expect(prompt).toContain("Use for editorial content");
    expect(prompt).toContain("landing-page");
    expect(prompt).toContain("Landing pages");
    expect(prompt).toContain("Use for conversion pages");
  });

  it("contains JSON output format instruction", () => {
    const prompt = buildRecommenderPrompt(scan, registryPolicies);
    expect(prompt).toContain('"recommendations"');
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('"reason"');
    expect(prompt).toContain("Return ONLY valid JSON");
  });
});

// ---------------------------------------------------------------------------
// gatherCandidateFiles()
// ---------------------------------------------------------------------------

describe("gatherCandidateFiles()", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkTmpDir();
  });

  afterEach(() => {
    rmTmpDir(tmpDir);
  });

  it("finds markdown files for text policies", () => {
    fs.writeFileSync(path.join(tmpDir, "post.md"), "# Blog Post");
    fs.writeFileSync(path.join(tmpDir, "article.html"), "<h1>Article</h1>");
    fs.writeFileSync(path.join(tmpDir, "notes.txt"), "Some notes");

    const result = gatherCandidateFiles(tmpDir, ["content-article"]);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((f) => f.endsWith("post.md"))).toBe(true);
    expect(result.some((f) => f.endsWith("article.html"))).toBe(true);
    expect(result.some((f) => f.endsWith("notes.txt"))).toBe(true);
  });

  it("finds image files for image policies", () => {
    fs.writeFileSync(path.join(tmpDir, "logo.png"), "");
    fs.writeFileSync(path.join(tmpDir, "photo.jpg"), "");
    fs.writeFileSync(path.join(tmpDir, "icon.svg"), "");

    const result = gatherCandidateFiles(tmpDir, ["social-graphic"]);
    expect(result.some((f) => f.endsWith("logo.png"))).toBe(true);
    expect(result.some((f) => f.endsWith("photo.jpg"))).toBe(true);
    expect(result.some((f) => f.endsWith("icon.svg"))).toBe(true);
  });

  it("finds .mjml in email dirs for email policies", () => {
    const emailDir = path.join(tmpDir, "emails");
    fs.mkdirSync(emailDir);
    fs.writeFileSync(path.join(emailDir, "welcome.mjml"), "<mjml></mjml>");

    const result = gatherCandidateFiles(tmpDir, ["email-campaign"]);
    expect(result.some((f) => f.endsWith("welcome.mjml"))).toBe(true);
  });

  it("returns empty for no matches", () => {
    // Only TypeScript files in an otherwise empty dir
    fs.writeFileSync(path.join(tmpDir, "index.ts"), "export {}");
    fs.writeFileSync(path.join(tmpDir, "helper.ts"), "export {}");

    const result = gatherCandidateFiles(tmpDir, ["content-article"]);
    expect(result).toEqual([]);
  });

  it("limits to 20 results", () => {
    for (let i = 0; i < 30; i++) {
      fs.writeFileSync(path.join(tmpDir, `post${i}.md`), "content");
    }

    const result = gatherCandidateFiles(tmpDir, ["content-article"]);
    expect(result.length).toBeLessThanOrEqual(20);
  });
});

// ---------------------------------------------------------------------------
// buildPromptGeneratorPrompt()
// ---------------------------------------------------------------------------

describe("buildPromptGeneratorPrompt()", () => {
  const installedPolicies: RegistryPolicy[] = [
    {
      name: "content-article",
      description: "SEO articles",
      usageHint: "Use for editorial content",
      policy: {
        name: "content-article",
        stages: ["objective", "subjective", "human"],
      },
    },
  ];

  const candidateFiles = [
    "content/blog/intro.md",
    "content/blog/advanced-guide.md",
  ];

  const projectDescription = "A marketing site for a SaaS startup";

  it("includes installed policy details", () => {
    const prompt = buildPromptGeneratorPrompt(
      installedPolicies,
      candidateFiles,
      projectDescription
    );
    expect(prompt).toContain("content-article");
    expect(prompt).toContain("SEO articles");
  });

  it("includes candidate files", () => {
    const prompt = buildPromptGeneratorPrompt(
      installedPolicies,
      candidateFiles,
      projectDescription
    );
    expect(prompt).toContain("content/blog/intro.md");
    expect(prompt).toContain("content/blog/advanced-guide.md");
  });

  it("includes project description", () => {
    const prompt = buildPromptGeneratorPrompt(
      installedPolicies,
      candidateFiles,
      projectDescription
    );
    expect(prompt).toContain("A marketing site for a SaaS startup");
  });

  it("contains JSON output format instruction", () => {
    const prompt = buildPromptGeneratorPrompt(
      installedPolicies,
      candidateFiles,
      projectDescription
    );
    expect(prompt).toContain('"prompt"');
    expect(prompt).toContain('"explanation"');
    expect(prompt).toContain('"uses_existing_file"');
    expect(prompt).toContain("Return ONLY valid JSON");
  });
});
