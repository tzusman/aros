import type { CheckContext, CheckResult } from "@aros/types";

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const allowed = (ctx.config.allowed as string[]) ?? [];
    return ctx.files.map((file) => {
      const passed = allowed.some((pattern) => {
        if (pattern.endsWith("/*")) {
          return file.contentType.startsWith(pattern.slice(0, -1));
        }
        return file.contentType === pattern;
      });
      return {
        name: "format-check",
        file: file.filename,
        passed,
        details: passed
          ? `Content type "${file.contentType}" is allowed.`
          : `Content type "${file.contentType}" is not in allowed list: ${allowed.join(", ")}.`,
      };
    });
  },
};
