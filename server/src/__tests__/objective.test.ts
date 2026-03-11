import { describe, it, expect } from "vitest";
import {
  runObjectiveChecks,
  type ObjectiveCheckConfig,
  type FileInput,
} from "../pipeline/objective.js";

// ---- Helpers ----

function makeFile(overrides: Partial<FileInput> = {}): FileInput {
  return {
    filename: "test.txt",
    content: "hello world",
    contentType: "text/plain",
    sizeBytes: 100,
    ...overrides,
  };
}

function makeCheck(
  name: string,
  config: Record<string, unknown> = {},
  severity: "blocking" | "warning" = "blocking"
): ObjectiveCheckConfig {
  return { name, config, severity };
}

// ---- file_size ----

describe("file_size check", () => {
  it("passes when file is under the limit", async () => {
    const file = makeFile({ sizeBytes: 5 * 1024 * 1024 }); // 5 MB
    const checks = [makeCheck("file_size", { max_mb: 10 })];
    const results = await runObjectiveChecks([file], checks);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("file_size");
    expect(results[0].passed).toBe(true);
    expect(results[0].severity).toBe("blocking");
  });

  it("passes when file size equals the limit exactly", async () => {
    const file = makeFile({ sizeBytes: 10 * 1024 * 1024 }); // exactly 10 MB
    const checks = [makeCheck("file_size", { max_mb: 10 })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(true);
  });

  it("fails when file exceeds the limit", async () => {
    const file = makeFile({ sizeBytes: 15 * 1024 * 1024 }); // 15 MB
    const checks = [makeCheck("file_size", { max_mb: 10 })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toBeTruthy();
  });

  it("uses default max_mb of 10 when config omitted", async () => {
    const file = makeFile({ sizeBytes: 11 * 1024 * 1024 }); // 11 MB, over default
    const checks = [makeCheck("file_size", {})];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(false);
  });

  it("produces one result per file", async () => {
    const files = [
      makeFile({ filename: "a.txt", sizeBytes: 1024 }),
      makeFile({ filename: "b.txt", sizeBytes: 2048 }),
    ];
    const checks = [makeCheck("file_size", { max_mb: 10 })];
    const results = await runObjectiveChecks(files, checks);
    expect(results).toHaveLength(2);
  });
});

// ---- format_check ----

describe("format_check check", () => {
  it("passes when content type is in the allowed list (exact match)", async () => {
    const file = makeFile({ contentType: "text/plain" });
    const checks = [makeCheck("format_check", { allowed: ["text/plain", "image/png"] })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(true);
  });

  it("fails when content type is not in the allowed list", async () => {
    const file = makeFile({ contentType: "video/mp4" });
    const checks = [makeCheck("format_check", { allowed: ["image/png", "text/plain"] })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toBeTruthy();
  });

  it("passes wildcard match: image/* matches image/png", async () => {
    const file = makeFile({ contentType: "image/png" });
    const checks = [makeCheck("format_check", { allowed: ["image/*"] })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(true);
  });

  it("passes wildcard match: image/* matches image/jpeg", async () => {
    const file = makeFile({ contentType: "image/jpeg" });
    const checks = [makeCheck("format_check", { allowed: ["image/*"] })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(true);
  });

  it("fails wildcard match: image/* does not match text/plain", async () => {
    const file = makeFile({ contentType: "text/plain" });
    const checks = [makeCheck("format_check", { allowed: ["image/*"] })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(false);
  });

  it("passes when one of multiple wildcards matches", async () => {
    const file = makeFile({ contentType: "application/pdf" });
    const checks = [
      makeCheck("format_check", { allowed: ["image/*", "text/*", "application/pdf"] }),
    ];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(true);
  });

  it("carries the warning severity through", async () => {
    const file = makeFile({ contentType: "video/mp4" });
    const checks = [makeCheck("format_check", { allowed: ["image/*"] }, "warning")];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].severity).toBe("warning");
  });
});

// ---- word_count ----

describe("word_count check", () => {
  it("passes when word count is within range", async () => {
    const file = makeFile({
      content: "one two three four five",
      contentType: "text/plain",
    });
    const checks = [makeCheck("word_count", { min: 3, max: 10 })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(true);
  });

  it("fails when word count is below min", async () => {
    const file = makeFile({
      content: "one two",
      contentType: "text/plain",
    });
    const checks = [makeCheck("word_count", { min: 5 })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toBeTruthy();
  });

  it("fails when word count exceeds max", async () => {
    const file = makeFile({
      content: "a b c d e f g h i j k",
      contentType: "text/plain",
    });
    const checks = [makeCheck("word_count", { max: 5 })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(false);
  });

  it("skips non-text files (returns passed=true with skip note)", async () => {
    const file = makeFile({
      filename: "img.png",
      content: "",
      contentType: "image/png",
      sizeBytes: 1024,
    });
    const checks = [makeCheck("word_count", { min: 10 })];
    const results = await runObjectiveChecks([file], checks);
    // For non-text files, the check should be skipped (passed=true, details indicate skip)
    expect(results[0].passed).toBe(true);
    expect(results[0].details).toMatch(/skip/i);
  });

  it("handles multi-line text correctly", async () => {
    const file = makeFile({
      content: "line one\nline two\nline three",
      contentType: "text/html",
    });
    const checks = [makeCheck("word_count", { min: 5, max: 10 })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(true);
  });
});

// ---- image_dimensions ----

describe("image_dimensions check", () => {
  const svgWith = (w: number, h: number) =>
    `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><rect/></svg>`;

  it("passes when SVG dimensions are within bounds", async () => {
    const file = makeFile({
      filename: "icon.svg",
      content: svgWith(800, 600),
      contentType: "image/svg+xml",
    });
    const checks = [
      makeCheck("image_dimensions", {
        min_width: 100,
        max_width: 1920,
        min_height: 100,
        max_height: 1080,
      }),
    ];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(true);
  });

  it("fails when SVG width exceeds max_width", async () => {
    const file = makeFile({
      filename: "wide.svg",
      content: svgWith(3000, 600),
      contentType: "image/svg+xml",
    });
    const checks = [makeCheck("image_dimensions", { max_width: 1920 })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toBeTruthy();
  });

  it("fails when SVG height exceeds max_height", async () => {
    const file = makeFile({
      filename: "tall.svg",
      content: svgWith(800, 2000),
      contentType: "image/svg+xml",
    });
    const checks = [makeCheck("image_dimensions", { max_height: 1080 })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(false);
  });

  it("fails when SVG width is below min_width", async () => {
    const file = makeFile({
      filename: "small.svg",
      content: svgWith(50, 600),
      contentType: "image/svg+xml",
    });
    const checks = [makeCheck("image_dimensions", { min_width: 100 })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(false);
  });

  it("skips (passed=true) when viewBox is not detectable", async () => {
    const file = makeFile({
      filename: "no-viewbox.svg",
      content: `<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`,
      contentType: "image/svg+xml",
    });
    const checks = [makeCheck("image_dimensions", { max_width: 100 })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(true);
    expect(results[0].details).toMatch(/skip/i);
  });

  it("skips (passed=true) for non-SVG files", async () => {
    const file = makeFile({
      filename: "photo.jpg",
      content: "",
      contentType: "image/jpeg",
    });
    const checks = [makeCheck("image_dimensions", { max_width: 100 })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(true);
    expect(results[0].details).toMatch(/skip/i);
  });
});

// ---- profanity_check ----

describe("profanity_check check", () => {
  it("passes for clean text", async () => {
    const file = makeFile({
      content: "This is a perfectly clean piece of text.",
      contentType: "text/plain",
    });
    const checks = [makeCheck("profanity_check", {})];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(true);
  });

  it("fails when text contains a word from the default list", async () => {
    const file = makeFile({
      // Using a word from the default profanity list
      content: "This content contains damn bad language.",
      contentType: "text/plain",
    });
    const checks = [makeCheck("profanity_check", {})];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(false);
    expect(results[0].details).toBeTruthy();
  });

  it("uses custom word list from config", async () => {
    const file = makeFile({
      content: "This content has a badword inside.",
      contentType: "text/plain",
    });
    const checks = [makeCheck("profanity_check", { words: ["badword"] })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(false);
  });

  it("passes clean text with custom word list (no match)", async () => {
    const file = makeFile({
      content: "Clean text with no problematic content whatsoever.",
      contentType: "text/plain",
    });
    const checks = [makeCheck("profanity_check", { words: ["badword"] })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(true);
  });

  it("is case-insensitive", async () => {
    const file = makeFile({
      content: "This has BADWORD in uppercase.",
      contentType: "text/plain",
    });
    const checks = [makeCheck("profanity_check", { words: ["badword"] })];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(false);
  });

  it("skips non-text files (passed=true with skip note)", async () => {
    const file = makeFile({
      filename: "img.png",
      content: "",
      contentType: "image/png",
    });
    const checks = [makeCheck("profanity_check", {})];
    const results = await runObjectiveChecks([file], checks);
    expect(results[0].passed).toBe(true);
    expect(results[0].details).toMatch(/skip/i);
  });
});

// ---- multiple checks on multiple files ----

describe("multiple checks and multiple files", () => {
  it("returns results for each check x each file combination", async () => {
    const files = [
      makeFile({ filename: "a.txt", sizeBytes: 100 }),
      makeFile({ filename: "b.txt", sizeBytes: 200 }),
    ];
    const checks = [
      makeCheck("file_size", { max_mb: 10 }),
      makeCheck("word_count", { min: 1 }),
    ];
    const results = await runObjectiveChecks(files, checks);
    // 2 files x 2 checks = 4 results
    expect(results).toHaveLength(4);
  });

  it("returns empty array when no files", async () => {
    const checks = [makeCheck("file_size", { max_mb: 10 })];
    const results = await runObjectiveChecks([], checks);
    expect(results).toHaveLength(0);
  });

  it("returns empty array when no checks", async () => {
    const files = [makeFile()];
    const results = await runObjectiveChecks(files, []);
    expect(results).toHaveLength(0);
  });
});
