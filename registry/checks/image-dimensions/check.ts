import type { CheckContext, CheckResult } from "@aros/types";

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    for (const file of ctx.files) {
      if (typeof file.content !== "string") continue;
      const match = file.content.match(/viewBox=["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/);
      if (!match) {
        results.push({ name: "image-dimensions", file: file.filename, passed: true, details: "Skipped — no viewBox found." });
        continue;
      }
      const width = parseFloat(match[1]);
      const height = parseFloat(match[2]);
      const violations: string[] = [];
      const minW = ctx.config.min_width as number | undefined;
      const maxW = ctx.config.max_width as number | undefined;
      const minH = ctx.config.min_height as number | undefined;
      const maxH = ctx.config.max_height as number | undefined;
      if (minW !== undefined && width < minW) violations.push(`width ${width} < min ${minW}`);
      if (maxW !== undefined && width > maxW) violations.push(`width ${width} > max ${maxW}`);
      if (minH !== undefined && height < minH) violations.push(`height ${height} < min ${minH}`);
      if (maxH !== undefined && height > maxH) violations.push(`height ${height} > max ${maxH}`);
      results.push({
        name: "image-dimensions",
        file: file.filename,
        passed: violations.length === 0,
        details: violations.length === 0 ? `SVG ${width}x${height} within bounds.` : violations.join("; "),
      });
    }
    return results;
  },
};
