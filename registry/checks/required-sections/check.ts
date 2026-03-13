import type { CheckContext, CheckResult } from "@aros/types";

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const required = (ctx.config.sections as string[]) ?? [];
    if (required.length === 0) {
      return ctx.files.map((file) => ({
        name: "required-sections",
        file: file.filename,
        passed: true,
        details: "No required sections configured — skipped.",
      }));
    }

    return ctx.files.map((file) => {
      if (typeof file.content !== "string") {
        return { name: "required-sections", file: file.filename, passed: true, details: "Skipped — binary content." };
      }

      const lower = file.content.toLowerCase();
      const missing = required.filter((s) => !lower.includes(s.toLowerCase()));

      return {
        name: "required-sections",
        file: file.filename,
        passed: missing.length === 0,
        details: missing.length === 0
          ? `All ${required.length} required sections found.`
          : `Missing ${missing.length} section(s): ${missing.join(", ")}`,
        suggestions: missing.length > 0
          ? [`Add the following sections: ${missing.join(", ")}`]
          : undefined,
      };
    });
  },
};
