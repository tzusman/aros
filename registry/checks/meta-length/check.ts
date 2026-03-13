import type { CheckContext, CheckResult } from "@aros/types";

function extractMeta(text: string): { title?: string; description?: string } {
  // Try YAML frontmatter first
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const titleMatch = fm.match(/^meta_title:\s*(.+)$/m);
    const descMatch = fm.match(/^meta_description:\s*(.+)$/m);
    if (titleMatch || descMatch) {
      return {
        title: titleMatch?.[1]?.trim(),
        description: descMatch?.[1]?.trim(),
      };
    }
  }

  // Fallback: H1 for title, first paragraph for description (only when H1 is present)
  const h1Match = text.match(/^#\s+(.+)$/m);
  if (!h1Match) {
    return {};
  }

  const paragraphs = text
    .replace(/^---[\s\S]*?---\n?/, "")
    .replace(/^#+\s+.+$/gm, "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return {
    title: h1Match[1]?.trim(),
    description: paragraphs[0],
  };
}

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const titleMin = (ctx.config.title_min as number) ?? 50;
    const titleMax = (ctx.config.title_max as number) ?? 60;
    const descMin = (ctx.config.desc_min as number) ?? 140;
    const descMax = (ctx.config.desc_max as number) ?? 160;

    return ctx.files.map((file) => {
      if (typeof file.content !== "string") {
        return { name: "meta-length", file: file.filename, passed: true, details: "Skipped — binary content." };
      }

      const meta = extractMeta(file.content);
      if (!meta.title && !meta.description) {
        return { name: "meta-length", file: file.filename, passed: true, details: "No meta title or description found — skipped." };
      }

      const issues: string[] = [];
      if (meta.title) {
        const len = meta.title.length;
        if (len < titleMin) issues.push(`Meta title too short: ${len} chars (min ${titleMin})`);
        if (len > titleMax) issues.push(`Meta title too long: ${len} chars (max ${titleMax})`);
      }
      if (meta.description) {
        const len = meta.description.length;
        if (len < descMin) issues.push(`Meta description too short: ${len} chars (min ${descMin})`);
        if (len > descMax) issues.push(`Meta description too long: ${len} chars (max ${descMax})`);
      }

      return {
        name: "meta-length",
        file: file.filename,
        passed: issues.length === 0,
        details: issues.length === 0
          ? `Meta title: ${meta.title?.length ?? "n/a"} chars, description: ${meta.description?.length ?? "n/a"} chars — within limits.`
          : issues.join("; "),
        suggestions: issues.length > 0 ? ["Adjust meta title (50-60 chars) and description (140-160 chars) for optimal search snippet display."] : undefined,
      };
    });
  },
};
