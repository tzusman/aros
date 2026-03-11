import type { CheckContext, CheckResult } from "@aros/types";

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    for (const file of ctx.files) {
      if (typeof file.content !== "string") continue;
      const count = file.content.split(/\s+/).filter(Boolean).length;
      const min = (ctx.config.min as number) ?? 0;
      const max = (ctx.config.max as number) ?? Infinity;
      results.push({
        name: "word-count",
        file: file.filename,
        passed: count >= min && count <= max,
        details: `${count} words (required: ${min}–${max})`,
      });
    }
    return results;
  },
};
