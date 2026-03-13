import type { CheckContext, CheckResult } from "@aros/types";

function extractHeadings(text: string): number[] {
  const levels: number[] = [];
  // Markdown headings: # through ######
  for (const match of text.matchAll(/^(#{1,6})\s+/gm)) {
    levels.push(match[1].length);
  }
  // HTML headings: <h1> through <h6>
  for (const match of text.matchAll(/<h([1-6])\b/gi)) {
    levels.push(parseInt(match[1], 10));
  }
  return levels;
}

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const requireH1 = (ctx.config.require_h1 as boolean) ?? true;
    const maxH1 = (ctx.config.max_h1_count as number) ?? 1;
    const allowSkip = (ctx.config.allow_skip_levels as boolean) ?? false;

    return ctx.files.map((file) => {
      if (typeof file.content !== "string") {
        return { name: "heading-structure", file: file.filename, passed: true, details: "Skipped — binary content." };
      }

      const levels = extractHeadings(file.content);
      if (levels.length === 0) {
        return {
          name: "heading-structure",
          file: file.filename,
          passed: !requireH1,
          details: requireH1 ? "No headings found — H1 is required." : "No headings found.",
        };
      }

      const issues: string[] = [];

      // Check H1 presence and count
      const h1Count = levels.filter((l) => l === 1).length;
      if (requireH1 && h1Count === 0) {
        issues.push("Missing H1 heading");
      }
      if (h1Count > maxH1) {
        issues.push(`Found ${h1Count} H1 headings (max ${maxH1})`);
      }

      // Check for skipped levels
      if (!allowSkip) {
        for (let i = 1; i < levels.length; i++) {
          if (levels[i] > levels[i - 1] + 1) {
            issues.push(`Heading level skip: H${levels[i - 1]} → H${levels[i]}`);
          }
        }
      }

      // Check for heading-only content (no body text between headings)
      const lines = file.content.split("\n");
      let consecutiveHeadings = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue; // skip blank lines
        if (/^#{1,6}\s+/.test(trimmed) || /^<h[1-6]\b/i.test(trimmed)) {
          consecutiveHeadings++;
          if (consecutiveHeadings >= 3) {
            issues.push("Multiple consecutive headings with no body text between them");
            break;
          }
        } else {
          consecutiveHeadings = 0;
        }
      }

      return {
        name: "heading-structure",
        file: file.filename,
        passed: issues.length === 0,
        details: issues.length === 0
          ? `${levels.length} headings with valid hierarchy.`
          : issues.join("; "),
        suggestions: issues.length > 0
          ? ["Ensure headings follow a sequential hierarchy (H1 → H2 → H3) without skipping levels."]
          : undefined,
      };
    });
  },
};
