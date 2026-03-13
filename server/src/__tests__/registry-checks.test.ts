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
