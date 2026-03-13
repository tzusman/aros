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

describe("link-validation", () => {
  let mod: { execute: (ctx: CheckContext) => Promise<any[]> };
  beforeAll(async () => {
    mod = (await import("../../../registry/checks/link-validation/check.ts")).default;
  });

  it("detects placeholder domain URLs", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Visit https://example.com/product")],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("example.com");
  });

  it("detects bare protocol", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Link: http://")],
    }));
    expect(results[0].passed).toBe(false);
  });

  it("detects mailto: with no address", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Email us at mailto:")],
    }));
    expect(results[0].passed).toBe(false);
  });

  it("detects URLs with TODO", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "See https://acme.com/TODO-fix-this")],
    }));
    expect(results[0].passed).toBe(false);
  });

  it("passes valid URLs", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Visit https://acme.com/products and https://acme.com/about")],
    }));
    expect(results[0].passed).toBe(true);
  });

  it("passes content with no URLs", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Just some text with no links.")],
    }));
    expect(results[0].passed).toBe(true);
  });

  it("detects broken anchor links", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "See the [details](#nonexistent-section) for more info.\n\n## Intro\n\nText here")],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("nonexistent-section");
  });

  it("passes valid anchor links", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "See the [details](#intro) for more info.\n\n## Intro\n\nText here")],
    }));
    expect(results[0].passed).toBe(true);
  });

  it("allows localhost when configured", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Test at http://localhost:3000")],
      config: { allow_localhost: true },
    }));
    expect(results[0].passed).toBe(true);
  });

  it("blocks localhost by default", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "Test at http://localhost:3000")],
    }));
    expect(results[0].passed).toBe(false);
  });
});

describe("heading-structure", () => {
  let mod: { execute: (ctx: CheckContext) => Promise<any[]> };
  beforeAll(async () => {
    mod = (await import("../../../registry/checks/heading-structure/check.ts")).default;
  });

  it("passes valid heading hierarchy", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "# Title\n\nIntro text\n\n## Section\n\nBody\n\n### Sub\n\nMore")],
    }));
    expect(results[0].passed).toBe(true);
  });

  it("fails when H1 is missing", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "## Section\n\nBody text")],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("H1");
  });

  it("fails when heading levels are skipped", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "# Title\n\n### Skipped H2\n\nBody")],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("skip");
  });

  it("fails when multiple H1s present", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "# Title\n\nText\n\n# Another Title\n\nMore")],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("H1");
  });

  it("allows skip levels when configured", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "# Title\n\n### Skipped H2\n\nBody")],
      config: { allow_skip_levels: true },
    }));
    expect(results[0].passed).toBe(true);
  });

  it("handles HTML headings", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.html", "<h1>Title</h1><p>Intro</p><h2>Section</h2>")],
    }));
    expect(results[0].passed).toBe(true);
  });

  it("warns on heading-only content with no body text between", async () => {
    const results = await mod.execute(makeCtx({
      files: [textFile("page.md", "# Title\n## Section One\n## Section Two\n### Sub")],
    }));
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("no body text");
  });
});
