import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadCriteriaLibrary } from "../modules/criteria-loader.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-criteria-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeCriterion(name: string, manifest: object) {
  const dir = path.join(tmpDir, "criteria", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
}

describe("loadCriteriaLibrary", () => {
  it("loads all criteria from directory", () => {
    writeCriterion("tone-alignment", {
      name: "tone-alignment",
      type: "criterion",
      version: "1.0.0",
      description: "Tone check",
      applicableTo: ["text/*"],
      defaultWeight: 2,
      scale: 10,
      promptGuidance: "Check tone",
    });
    writeCriterion("visual-quality", {
      name: "visual-quality",
      type: "criterion",
      version: "1.0.0",
      description: "Visual quality",
      applicableTo: ["image/*"],
      defaultWeight: 3,
      scale: 10,
      promptGuidance: "Check visual quality",
    });

    const library = loadCriteriaLibrary(tmpDir);
    expect(library.size).toBe(2);
    expect(library.get("tone-alignment")!.applicableTo).toEqual(["text/*"]);
    expect(library.get("visual-quality")!.promptGuidance).toBe("Check visual quality");
  });

  it("returns empty map if directory does not exist", () => {
    const library = loadCriteriaLibrary(path.join(tmpDir, "nonexistent"));
    expect(library.size).toBe(0);
  });
});
