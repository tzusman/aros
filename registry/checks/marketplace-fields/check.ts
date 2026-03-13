import type { CheckContext, CheckResult } from "@aros/types";

interface FieldLimit { min?: number; max?: number; }

function extractFields(text: string): Record<string, string> {
  // Try JSON first
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) {
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        fields[key] = Array.isArray(value) ? value.join("\n") : String(value);
      }
      return fields;
    }
  } catch { /* not JSON, try markdown */ }

  // Markdown: extract H2 sections
  const fields: Record<string, string> = {};
  const sections = text.split(/^##\s+/m).slice(1);
  for (const section of sections) {
    const lines = section.split("\n");
    const heading = lines[0]?.trim().toLowerCase() ?? "";
    const body = lines.slice(1).join("\n").trim();
    if (heading) fields[heading] = body;
  }
  return fields;
}

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const requiredFields = (ctx.config.required_fields as string[]) ?? ["title", "description"];
    const fieldLimits = (ctx.config.field_limits as Record<string, FieldLimit>) ?? {};

    return ctx.files.map((file) => {
      if (typeof file.content !== "string") {
        return { name: "marketplace-fields", file: file.filename, passed: true, details: "Skipped — binary content." };
      }

      const fields = extractFields(file.content);
      const issues: string[] = [];

      // Check required fields
      const missing = requiredFields.filter((f) => {
        const key = Object.keys(fields).find((k) => k.toLowerCase() === f.toLowerCase());
        return !key || !fields[key]?.trim();
      });
      if (missing.length > 0) {
        issues.push(`Missing fields: ${missing.join(", ")}`);
      }

      // Check field limits
      for (const [fieldName, limits] of Object.entries(fieldLimits)) {
        const key = Object.keys(fields).find((k) => k.toLowerCase() === fieldName.toLowerCase());
        if (!key || !fields[key]) continue;
        const len = fields[key].length;
        if (limits.min && len < limits.min) {
          issues.push(`${fieldName}: ${len} chars (min ${limits.min})`);
        }
        if (limits.max && len > limits.max) {
          issues.push(`${fieldName}: ${len} chars (max ${limits.max})`);
        }
      }

      return {
        name: "marketplace-fields",
        file: file.filename,
        passed: issues.length === 0,
        details: issues.length === 0
          ? `All ${requiredFields.length} required fields present and within limits.`
          : issues.join("; "),
        suggestions: issues.length > 0
          ? ["Ensure all required marketplace fields are populated and within character limits."]
          : undefined,
      };
    });
  },
};
