import type { CheckContext, CheckResult } from "@aros/types";

function parseRatio(ratio: string): number {
  const parts = ratio.split(":");
  if (parts.length !== 2) return NaN;
  return parseFloat(parts[0]) / parseFloat(parts[1]);
}

function detectDimensions(content: string | Buffer, contentType: string): { width: number; height: number } | null {
  const buf = typeof content === "string" ? Buffer.from(content, "base64") : content;

  // PNG: width at bytes 16-19, height at bytes 20-23 (big-endian)
  if (contentType === "image/png" && buf.length >= 24) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // JPEG: scan for SOF0/SOF2 markers
  if ((contentType === "image/jpeg" || contentType === "image/jpg") && buf.length >= 2) {
    for (let i = 0; i < buf.length - 8; i++) {
      if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
    }
  }

  // SVG: parse viewBox
  if (contentType === "image/svg+xml" && typeof content === "string") {
    const match = content.match(/viewBox=["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/);
    if (match) {
      return { width: parseFloat(match[1]), height: parseFloat(match[2]) };
    }
  }

  return null;
}

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const allowedRatios = (ctx.config.allowed_ratios as string[]) ?? ["1:1"];
    const tolerance = (ctx.config.tolerance as number) ?? 0.02;
    const results: CheckResult[] = [];

    for (const file of ctx.files) {
      const dims = detectDimensions(file.content, file.contentType);
      if (!dims) {
        results.push({
          name: "aspect-ratio",
          file: file.filename,
          passed: true,
          details: "Skipped — could not detect dimensions.",
        });
        continue;
      }

      const actual = dims.width / dims.height;
      const matched = allowedRatios.find((r) => {
        const target = parseRatio(r);
        return Math.abs(actual - target) / target <= tolerance;
      });

      results.push({
        name: "aspect-ratio",
        file: file.filename,
        passed: !!matched,
        details: matched
          ? `${dims.width}x${dims.height} matches ${matched}`
          : `${dims.width}x${dims.height} (ratio ${actual.toFixed(3)}) does not match any of: ${allowedRatios.join(", ")}`,
        suggestions: matched ? undefined : [`Resize to one of: ${allowedRatios.join(", ")}`],
      });
    }
    return results;
  },
};
