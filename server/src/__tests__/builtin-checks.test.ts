import { describe, it, expect } from "vitest";

describe("built-in check modules", () => {
  it("word-count passes for valid content", async () => {
    const mod = (await import("../modules/builtin-checks/word-count/check.js")).default;
    const results = await mod.execute({
      files: [{ filename: "test.md", content: "hello world foo bar baz", contentType: "text/markdown", sizeBytes: 23 }],
      config: { min: 3, max: 10 }, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(true);
    expect(results[0].details).toContain("5 words");
  });

  it("word-count fails when below minimum", async () => {
    const mod = (await import("../modules/builtin-checks/word-count/check.js")).default;
    const results = await mod.execute({
      files: [{ filename: "test.md", content: "hello", contentType: "text/markdown", sizeBytes: 5 }],
      config: { min: 10, max: 100 }, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(false);
  });

  it("file-size passes for small files", async () => {
    const mod = (await import("../modules/builtin-checks/file-size/check.js")).default;
    const results = await mod.execute({
      files: [{ filename: "test.txt", content: "hello", contentType: "text/plain", sizeBytes: 5 }],
      config: { max_mb: 1 }, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(true);
  });

  it("file-size fails for oversized files", async () => {
    const mod = (await import("../modules/builtin-checks/file-size/check.js")).default;
    const results = await mod.execute({
      files: [{ filename: "big.bin", content: "", contentType: "application/octet-stream", sizeBytes: 20 * 1024 * 1024 }],
      config: { max_mb: 10 }, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(false);
  });

  it("format-check validates content types", async () => {
    const mod = (await import("../modules/builtin-checks/format-check/check.js")).default;
    const results = await mod.execute({
      files: [{ filename: "doc.md", content: "text", contentType: "text/markdown", sizeBytes: 4 }],
      config: { allowed: ["text/*", "image/png"] }, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(true);
  });

  it("image-dimensions checks SVG viewBox", async () => {
    const mod = (await import("../modules/builtin-checks/image-dimensions/check.js")).default;
    const svg = '<svg viewBox="0 0 800 600"></svg>';
    const results = await mod.execute({
      files: [{ filename: "logo.svg", content: svg, contentType: "image/svg+xml", sizeBytes: svg.length }],
      config: { max_width: 1000, max_height: 800 }, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(true);
    expect(results[0].details).toContain("800x600");
  });

  it("profanity detects prohibited words", async () => {
    const mod = (await import("../modules/builtin-checks/profanity/check.js")).default;
    const results = await mod.execute({
      files: [{ filename: "post.md", content: "this is damn good", contentType: "text/markdown", sizeBytes: 17 }],
      config: {}, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toContain("damn");
  });

  it("profanity passes clean content", async () => {
    const mod = (await import("../modules/builtin-checks/profanity/check.js")).default;
    const results = await mod.execute({
      files: [{ filename: "post.md", content: "this is great content", contentType: "text/markdown", sizeBytes: 21 }],
      config: {}, brief: "", projectDir: "/tmp",
    });
    expect(results[0].passed).toBe(true);
  });
});
