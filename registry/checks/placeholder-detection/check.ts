import type { CheckContext, CheckResult } from "@aros/types";

const DEFAULT_PATTERNS = [
  /\[INSERT.*?\]/gi,
  /\[TODO.*?\]/gi,
  /\[TBD\]/gi,
  /\blorem ipsum\b/gi,
  /\bfoo\.com\b/gi,
  /\bexample\.(com|org|net)\b/gi,
  /\bXXX\b/g,
  /\basdf\b/gi,
  /\{\{.*?\}\}/g,
  /<your .+? here>/gi,
];

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const customPatterns = ((ctx.config.custom_patterns as string[]) ?? []).map(
      (p) => new RegExp(p, "gi")
    );
    const allPatterns = [...DEFAULT_PATTERNS, ...customPatterns];

    return ctx.files.map((file) => {
      const text =
        typeof file.content === "string"
          ? file.content
          : file.content.toString("utf-8");

      const found: string[] = [];
      for (const pattern of allPatterns) {
        pattern.lastIndex = 0;
        const matches = text.match(pattern);
        if (matches) found.push(...matches);
      }

      return {
        name: "placeholder-detection",
        file: file.filename,
        passed: found.length === 0,
        details:
          found.length === 0
            ? "No placeholder content detected."
            : `Found ${found.length} placeholder(s): ${found.slice(0, 5).join(", ")}${found.length > 5 ? ` (+${found.length - 5} more)` : ""}`,
        suggestions: found.length > 0 ? ["Replace all placeholder content before publishing."] : undefined,
      };
    });
  },
};
