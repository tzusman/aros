import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  readRegistry,
  writeRegistry,
  addSource,
  removeSource,
  readLockfile,
  writeLockfile,
  lockModule,
  unlockModule,
} from "../modules/registry.js";

let arosDir: string;

beforeEach(() => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-registry-"));
  arosDir = path.join(tmpDir, ".aros");
  fs.mkdirSync(arosDir, { recursive: true });
  fs.writeFileSync(
    path.join(arosDir, "registry.json"),
    JSON.stringify({ sources: [{ name: "official", url: "https://github.com/aros-project/modules.git", branch: "main" }] })
  );
  fs.writeFileSync(
    path.join(arosDir, "lock.json"),
    JSON.stringify({ version: 1, locked: {} })
  );
});

afterEach(() => {
  fs.rmSync(path.dirname(arosDir), { recursive: true, force: true });
});

describe("registry", () => {
  it("reads sources", () => {
    const reg = readRegistry(arosDir);
    expect(reg.sources).toHaveLength(1);
    expect(reg.sources[0].name).toBe("official");
  });

  it("adds a source", () => {
    addSource(arosDir, { name: "company", url: "https://github.com/acme/modules.git", branch: "main" });
    const reg = readRegistry(arosDir);
    expect(reg.sources).toHaveLength(2);
    expect(reg.sources[1].name).toBe("company");
  });

  it("prevents duplicate source names", () => {
    expect(() =>
      addSource(arosDir, { name: "official", url: "https://other.git", branch: "main" })
    ).toThrow(/already exists/i);
  });

  it("removes a source", () => {
    addSource(arosDir, { name: "company", url: "https://github.com/acme/modules.git", branch: "main" });
    removeSource(arosDir, "company");
    const reg = readRegistry(arosDir);
    expect(reg.sources).toHaveLength(1);
  });
});

describe("lockfile", () => {
  it("reads empty lockfile", () => {
    const lock = readLockfile(arosDir);
    expect(lock.locked).toEqual({});
  });

  it("locks a module", () => {
    lockModule(arosDir, "checks/word-count", {
      source: "official",
      path: "checks/word-count",
      sha: "abc123",
      version: "1.0.0",
      lockedAt: "2026-03-12T00:00:00Z",
    });
    const lock = readLockfile(arosDir);
    expect(lock.locked["checks/word-count"].sha).toBe("abc123");
  });

  it("unlocks a module", () => {
    lockModule(arosDir, "checks/word-count", {
      source: "official",
      path: "checks/word-count",
      sha: "abc123",
      version: "1.0.0",
      lockedAt: "2026-03-12T00:00:00Z",
    });
    unlockModule(arosDir, "checks/word-count");
    const lock = readLockfile(arosDir);
    expect(lock.locked["checks/word-count"]).toBeUndefined();
  });
});
