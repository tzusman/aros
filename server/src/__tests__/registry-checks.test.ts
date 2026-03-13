import { describe, it, expect, beforeAll } from "vitest";
import type { CheckContext } from "@aros/types";

function makeCtx(overrides: Partial<CheckContext> & { files: CheckContext["files"] }): CheckContext {
  return { config: {}, brief: "", projectDir: "/tmp", ...overrides };
}

function textFile(filename: string, content: string) {
  return { filename, content, contentType: "text/markdown", sizeBytes: content.length };
}

function svgFile(filename: string, content: string) {
  return { filename, content, contentType: "image/svg+xml", sizeBytes: content.length };
}

// Tests will be added per check in subsequent tasks

describe("placeholder-detection", () => {
  let mod: { execute: (ctx: CheckContext) => Promise<any[]> };
  beforeAll(async () => {
    mod = (await import("../../../registry/checks/placeholder-detection/check.ts")).default;
  });

  it("detects [INSERT] tokens", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Welcome to [INSERT COMPANY NAME]")],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("[INSERT COMPANY NAME]");
  });

  it("detects lorem ipsum", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Lorem ipsum dolor sit amet")],
    }));
    expect(results[0].passed).toBe(false);
  });

  it("detects example.com", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Visit us at https://example.com")],
    }));
    expect(results[0].passed).toBe(false);
  });

  it("detects template variables {{var}}", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Hello {{user_name}}, welcome!")],
    }));
    expect(results[0].passed).toBe(false);
  });

  it("passes clean content", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Welcome to Acme Corp. We build great products.")],
    }));
    expect(results[0].passed).toBe(true);
  });

  it("supports custom patterns", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Price: $PRICE_HERE")],
      config: { custom_patterns: ["\\$PRICE_HERE"] },
    }));
    expect(results[0].passed).toBe(false);
  });

  it("detects placeholders in SVG text", async () => {
    const results = await mod.execute({
      files: [svgFile("ad.svg", '<svg><text>[TODO: Add headline]</text></svg>')],
      config: {}, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(false);
  });
});
