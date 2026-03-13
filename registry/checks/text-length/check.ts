import type { CheckContext, CheckResult } from "@aros/types";

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const minChars = (ctx.config.min_chars as number) ?? 0;
    const maxChars = (ctx.config.max_chars as number) ?? 2200;

    for (const file of ctx.files) {
      if (typeof file.content !== "string") continue;
      const charCount = file.content.trim().length;

      results.push({
        name: "text-length",
        file: file.filename,
        passed: charCount >= minChars && charCount <= maxChars,
        details: `${charCount} characters (allowed: ${minChars}–${maxChars})`,
        suggestions:
          charCount > maxChars
            ? [`Shorten by ${charCount - maxChars} characters`]
            : charCount < minChars
              ? [`Add at least ${minChars - charCount} more characters`]
              : undefined,
      });
    }
    return results;
  },
};
