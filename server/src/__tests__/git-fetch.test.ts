import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fetchModuleFromGit, getLatestSha } from "../modules/git-fetch.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-git-fetch-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Integration tests that use a real local git repo as a source
describe("fetchModuleFromGit", () => {
  let repoDir: string;

  beforeEach(async () => {
    // Create a local git repo to use as source
    repoDir = path.join(tmpDir, "source-repo");
    fs.mkdirSync(path.join(repoDir, "checks", "word-count"), { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, "checks", "word-count", "manifest.json"),
      JSON.stringify({ name: "word-count", type: "check", version: "1.0.0" })
    );
    fs.writeFileSync(
      path.join(repoDir, "checks", "word-count", "check.ts"),
      'export default { execute: async () => [] };'
    );
    const { execSync } = await import("node:child_process");
    execSync("git init && git branch -M main && git add -A && git commit -m init", { cwd: repoDir, stdio: "pipe" });
  });

  it("fetches a module directory to a destination", async () => {
    const destDir = path.join(tmpDir, "dest");
    fs.mkdirSync(destDir, { recursive: true });
    const sha = await getLatestSha(repoDir, "main", "checks/word-count");
    await fetchModuleFromGit(repoDir, "checks/word-count", sha, path.join(destDir, "checks", "word-count"));
    expect(fs.existsSync(path.join(destDir, "checks", "word-count", "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(destDir, "checks", "word-count", "check.ts"))).toBe(true);
  });
});

describe("getLatestSha", () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = path.join(tmpDir, "sha-repo");
    fs.mkdirSync(path.join(repoDir, "checks", "test"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, "checks", "test", "manifest.json"), "{}");
    const { execSync } = await import("node:child_process");
    execSync("git init && git branch -M main && git add -A && git commit -m init", { cwd: repoDir, stdio: "pipe" });
  });

  it("returns the HEAD sha", async () => {
    const sha = await getLatestSha(repoDir, "main", "checks/test");
    expect(sha).toMatch(/^[a-f0-9]{40}$/);
  });
});
