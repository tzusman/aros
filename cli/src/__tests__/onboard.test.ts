import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { scanRepo, callClaude, parseJsonResponse } from "../onboard.js";

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
