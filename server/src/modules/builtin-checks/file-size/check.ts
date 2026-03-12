import type { CheckContext, CheckResult } from "@aros/types";

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const maxMb = (ctx.config.max_mb as number) ?? 10;
    const maxBytes = maxMb * 1024 * 1024;
    return ctx.files.map((file) => ({
      name: "file-size",
      file: file.filename,
      passed: file.sizeBytes <= maxBytes,
      details: file.sizeBytes <= maxBytes
        ? `${file.sizeBytes} bytes is within ${maxMb} MB limit.`
        : `${file.sizeBytes} bytes exceeds ${maxMb} MB limit (${maxBytes} bytes).`,
    }));
  },
};
