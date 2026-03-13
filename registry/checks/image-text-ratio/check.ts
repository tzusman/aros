import type { CheckContext, CheckResult } from "@aros/types";

function estimateTextArea(svg: string): { textPercent: number; viewBoxArea: number } | null {
  const vbMatch = svg.match(/viewBox=["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/);
  if (!vbMatch) return null;

  const vbWidth = parseFloat(vbMatch[1]);
  const vbHeight = parseFloat(vbMatch[2]);
  const viewBoxArea = vbWidth * vbHeight;
  if (viewBoxArea === 0) return null;

  let textArea = 0;
  // Estimate each <text> element's bounding box from font-size and content length
  const textElements = svg.matchAll(/<text[^>]*font-size=["']?([\d.]+)["']?[^>]*>([\s\S]*?)<\/text>/gi);
  for (const match of textElements) {
    const fontSize = parseFloat(match[1]) || 16;
    const content = match[2].replace(/<[^>]*>/g, "").trim();
    const charWidth = fontSize * 0.6; // approximate character width
    const lineHeight = fontSize * 1.2;
    textArea += content.length * charWidth * lineHeight;
  }

  // Also catch <text> without font-size (default ~16)
  const plainTexts = svg.matchAll(/<text(?![^>]*font-size)[^>]*>([\s\S]*?)<\/text>/gi);
  for (const match of plainTexts) {
    const content = match[1].replace(/<[^>]*>/g, "").trim();
    textArea += content.length * 9.6 * 19.2; // 16 * 0.6 * 16 * 1.2
  }

  return { textPercent: (textArea / viewBoxArea) * 100, viewBoxArea };
}

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const maxPercent = (ctx.config.max_text_percent as number) ?? 20;

    return ctx.files.map((file) => {
      if (file.contentType !== "image/svg+xml") {
        return {
          name: "image-text-ratio",
          file: file.filename,
          passed: true,
          details: "SVG only — skipped for this file type. Raster text detection is a future enhancement.",
        };
      }

      const text = typeof file.content === "string" ? file.content : file.content.toString("utf-8");
      const result = estimateTextArea(text);

      if (!result) {
        return {
          name: "image-text-ratio",
          file: file.filename,
          passed: true,
          details: "Could not parse SVG viewBox — skipped.",
        };
      }

      const percent = Math.round(result.textPercent * 10) / 10;
      return {
        name: "image-text-ratio",
        file: file.filename,
        passed: percent <= maxPercent,
        details: `Estimated text area: ${percent}% (max ${maxPercent}%)`,
        suggestions: percent > maxPercent
          ? [`Reduce text overlay — Meta recommends <${maxPercent}% text on ad images.`]
          : undefined,
      };
    });
  },
};
