import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { addModule } from "../modules/add.js";

let projectDir: string;
let sourceRepoDir: string;

beforeEach(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-add-"));
  projectDir = path.join(tmpDir, "project");
  sourceRepoDir = path.join(tmpDir, "source");

  // Set up project .aros dir
  const arosDir = path.join(projectDir, ".aros");
  fs.mkdirSync(path.join(arosDir, "modules", "checks"), { recursive: true });
  fs.mkdirSync(path.join(arosDir, "modules", "criteria"), { recursive: true });
  fs.mkdirSync(path.join(arosDir, "modules", "policies"), { recursive: true });

  // Set up source repo with a check module
  fs.mkdirSync(path.join(sourceRepoDir, "checks", "word-count"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRepoDir, "checks", "word-count", "manifest.json"),
    JSON.stringify({
      name: "word-count", type: "check", version: "1.0.0",
      description: "Word count", supportedTypes: ["text/*"],
      configSchema: {}, dependencies: { binaries: [], env: [], npm: [] },
      entrypoint: "check.ts",
    })
  );
  fs.writeFileSync(
    path.join(sourceRepoDir, "checks", "word-count", "check.ts"),
    'export default { execute: async () => [{ name: "word-count", file: null, passed: true, details: "ok" }] };'
  );

  // Set up source repo with a criterion
  fs.mkdirSync(path.join(sourceRepoDir, "criteria", "tone"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRepoDir, "criteria", "tone", "manifest.json"),
    JSON.stringify({
      name: "tone", type: "criterion", version: "1.0.0",
      description: "Tone check", applicableTo: ["text/*"],
      defaultWeight: 2, scale: 10, promptGuidance: "Check tone",
    })
  );

  const { execSync } = await import("node:child_process");
  execSync("git init && git branch -M main && git add -A && git commit -m init", { cwd: sourceRepoDir, stdio: "pipe" });

  // Write registry pointing to source repo
  fs.writeFileSync(
    path.join(arosDir, "registry.json"),
    JSON.stringify({ sources: [{ name: "local", url: sourceRepoDir, branch: "main" }] })
  );
  fs.writeFileSync(
    path.join(arosDir, "lock.json"),
    JSON.stringify({ version: 1, locked: {} })
  );
});

afterEach(() => {
  fs.rmSync(path.dirname(projectDir), { recursive: true, force: true });
});

describe("addModule", () => {
  it("fetches a check module, compiles it, and locks it", async () => {
    await addModule(projectDir, "checks/word-count");

    // Check files exist
    const modDir = path.join(projectDir, ".aros", "modules", "checks", "word-count");
    expect(fs.existsSync(path.join(modDir, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(modDir, "check.js"))).toBe(true); // compiled

    // Check lockfile updated
    const lock = JSON.parse(
      fs.readFileSync(path.join(projectDir, ".aros", "lock.json"), "utf-8")
    );
    expect(lock.locked["checks/word-count"]).toBeDefined();
    expect(lock.locked["checks/word-count"].source).toBe("local");
  });

  it("fetches a criterion module (no compilation needed)", async () => {
    await addModule(projectDir, "criteria/tone");

    const modDir = path.join(projectDir, ".aros", "modules", "criteria", "tone");
    expect(fs.existsSync(path.join(modDir, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(modDir, "check.js"))).toBe(false); // no code

    const lock = JSON.parse(
      fs.readFileSync(path.join(projectDir, ".aros", "lock.json"), "utf-8")
    );
    expect(lock.locked["criteria/tone"]).toBeDefined();
  });

  it("throws if module not found in any source", async () => {
    await expect(addModule(projectDir, "checks/nonexistent")).rejects.toThrow(
      /not found/i
    );
  });

  it("resolves transitive policy dependencies", async () => {
    // Add a policy that requires the word-count check and tone criterion
    const { execSync } = await import("node:child_process");
    fs.mkdirSync(path.join(sourceRepoDir, "policies", "test-policy"), { recursive: true });
    fs.writeFileSync(
      path.join(sourceRepoDir, "policies", "test-policy", "manifest.json"),
      JSON.stringify({
        name: "test-policy", type: "policy", version: "1.0.0",
        description: "Test policy",
        requires: { checks: ["word-count"], criteria: ["tone"] },
        policy: {
          name: "test-policy", stages: ["objective", "subjective"], max_revisions: 2,
          objective: { checks: [{ name: "word-count", config: {}, severity: "blocking" }], fail_threshold: 1 },
          subjective: { criteria: [{ name: "tone", weight: 2, scale: 10 }], pass_threshold: 7.0 },
        },
      })
    );
    execSync("git add -A && git commit -m 'add policy'", { cwd: sourceRepoDir, stdio: "pipe" });

    await addModule(projectDir, "policies/test-policy");

    const lock = JSON.parse(fs.readFileSync(path.join(projectDir, ".aros", "lock.json"), "utf-8"));
    expect(lock.locked["policies/test-policy"]).toBeDefined();
    expect(lock.locked["checks/word-count"]).toBeDefined();
    expect(lock.locked["criteria/tone"]).toBeDefined();
  });
});
