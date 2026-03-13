import type { CheckContext, CheckResult } from "@aros/types";

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const minChars = (ctx.config.min_chars as number) ?? 20;
    const maxChars = (ctx.config.max_chars as number) ?? 60;

    return ctx.files.map((file) => {
      if (typeof file.content !== "string") {
        return { name: "subject-line-length", file: file.filename, passed: true, details: "Skipped — binary content." };
      }

      // Subject is the first line of the file (per input format convention)
      const firstLine = file.content.split("\n")[0]?.trim() ?? "";
      const len = firstLine.length;

      return {
        name: "subject-line-length",
        file: file.filename,
        passed: len >= minChars && len <= maxChars,
        details: `Subject line: ${len} characters (allowed: ${minChars}–${maxChars})`,
        suggestions:
          len > maxChars
            ? [`Shorten subject by ${len - maxChars} characters — long subjects get truncated on mobile.`]
            : len < minChars
              ? [`Subject line is too short (${len} chars) — aim for at least ${minChars} characters.`]
              : undefined,
      };
    });
  },
};
