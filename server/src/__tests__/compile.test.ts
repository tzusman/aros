import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { compileCheckModule } from "../modules/compile.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-compile-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("compileCheckModule", () => {
  it("compiles check.ts to check.js", () => {
    fs.writeFileSync(
      path.join(tmpDir, "check.ts"),
      `import { join } from "node:path";
export default {
  async execute(ctx: any) {
    return [{ name: "test", file: null, passed: true, details: join("a", "b") }];
  }
};`
    );
    compileCheckModule(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "check.js"))).toBe(true);
    const content = fs.readFileSync(path.join(tmpDir, "check.js"), "utf-8");
    expect(content).toContain("execute");
  });

  it("skips if no check.ts exists", () => {
    compileCheckModule(tmpDir); // should not throw
    expect(fs.existsSync(path.join(tmpDir, "check.js"))).toBe(false);
  });
});
