import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadCheck, loadAllChecks, loadCheckManifest } from "../modules/check-loader.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-check-loader-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeModule(name: string, manifest: object, jsCode: string) {
  const dir = path.join(tmpDir, "checks", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, "check.js"), jsCode);
}

describe("loadCheckManifest", () => {
  it("reads and validates manifest.json", () => {
    writeModule("word-count", {
      name: "word-count",
      type: "check",
      version: "1.0.0",
      description: "Word count",
      supportedTypes: ["text/*"],
      configSchema: {},
      dependencies: { binaries: [], env: [], npm: [] },
      entrypoint: "check.ts",
    }, "export default { execute: async () => [] };");

    const manifest = loadCheckManifest(tmpDir, "word-count");
    expect(manifest.name).toBe("word-count");
    expect(manifest.supportedTypes).toEqual(["text/*"]);
  });
});

describe("loadCheck", () => {
  it("loads a compiled check module", async () => {
    writeModule("simple", {
      name: "simple",
      type: "check",
      version: "1.0.0",
      description: "Simple",
      supportedTypes: ["text/*"],
      configSchema: {},
      dependencies: { binaries: [], env: [], npm: [] },
      entrypoint: "check.ts",
    }, `export default { execute: async (ctx) => [{ name: "simple", file: null, passed: true, details: "ok" }] };`);

    const mod = await loadCheck("simple", tmpDir);
    const results = await mod.execute({ files: [], config: {}, brief: "", projectDir: tmpDir });
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
  });
});

describe("loadAllChecks", () => {
  it("loads all checks from directory", async () => {
    writeModule("a", {
      name: "a", type: "check", version: "1.0.0", description: "A",
      supportedTypes: ["text/*"], configSchema: {},
      dependencies: { binaries: [], env: [], npm: [] }, entrypoint: "check.ts",
    }, `export default { execute: async () => [{ name: "a", file: null, passed: true, details: "ok" }] };`);

    writeModule("b", {
      name: "b", type: "check", version: "1.0.0", description: "B",
      supportedTypes: ["image/*"], configSchema: {},
      dependencies: { binaries: [], env: [], npm: [] }, entrypoint: "check.ts",
    }, `export default { execute: async () => [{ name: "b", file: null, passed: true, details: "ok" }] };`);

    const checks = await loadAllChecks(tmpDir);
    expect(checks.size).toBe(2);
    expect(checks.has("a")).toBe(true);
    expect(checks.has("b")).toBe(true);
  });

  it("returns empty map if directory does not exist", async () => {
    const checks = await loadAllChecks(path.join(tmpDir, "nonexistent"));
    expect(checks.size).toBe(0);
  });
});
