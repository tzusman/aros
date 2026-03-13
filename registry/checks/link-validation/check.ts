import type { CheckContext, CheckResult } from "@aros/types";

const URL_REGEX = /(?:https?:\/\/|mailto:)[^\s)<>"'`]*/gi;
const ANCHOR_REGEX = /\(#([a-zA-Z0-9_-]+)\)/g;

function extractHeadingIds(text: string): Set<string> {
  const ids = new Set<string>();
  // Markdown headings → slug (lowercase, spaces to hyphens, strip non-alphanum)
  for (const match of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const slug = match[1].trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
    ids.add(slug);
  }
  // HTML id attributes
  for (const match of text.matchAll(/\bid=["']([^"']+)["']/g)) {
    ids.add(match[1]);
  }
  return ids;
}

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const allowLocalhost = (ctx.config.allow_localhost as boolean) ?? false;
    const blockedDomains = (ctx.config.blocked_domains as string[]) ?? [
      "example.com", "test.com", "foo.com", "yoursite.com",
    ];

    return ctx.files.map((file) => {
      if (typeof file.content !== "string") {
        return { name: "link-validation", file: file.filename, passed: true, details: "Skipped — binary content." };
      }

      const urls = file.content.match(URL_REGEX) ?? [];
      const anchors = [...file.content.matchAll(ANCHOR_REGEX)].map((m) => m[1]);
      if (urls.length === 0 && anchors.length === 0) {
        return { name: "link-validation", file: file.filename, passed: true, details: "No URLs found." };
      }

      const issues: string[] = [];

      // Check anchor links against heading IDs
      if (anchors.length > 0) {
        const headingIds = extractHeadingIds(file.content);
        for (const anchor of anchors) {
          if (!headingIds.has(anchor)) {
            issues.push(`Broken anchor: #${anchor}`);
          }
        }
      }

      for (const url of urls) {
        // Bare protocol
        if (/^https?:\/\/?$/.test(url)) {
          issues.push(`Bare protocol: ${url}`);
          continue;
        }
        // mailto: with no address
        if (/^mailto:?\s*$/.test(url)) {
          issues.push(`Empty mailto: ${url}`);
          continue;
        }
        // URL contains TODO or INSERT
        if (/TODO|INSERT/i.test(url)) {
          issues.push(`Placeholder URL: ${url}`);
          continue;
        }
        // Localhost
        if (!allowLocalhost && /localhost|127\.0\.0\.1/i.test(url)) {
          issues.push(`Localhost URL: ${url}`);
          continue;
        }
        // Blocked domains
        for (const domain of blockedDomains) {
          if (url.toLowerCase().includes(domain.toLowerCase())) {
            issues.push(`Placeholder domain (${domain}): ${url}`);
            break;
          }
        }
      }

      return {
        name: "link-validation",
        file: file.filename,
        passed: issues.length === 0,
        details: issues.length === 0
          ? `${urls.length} URL(s) validated — no issues found.`
          : `${issues.length} issue(s): ${issues.join("; ")}`,
        suggestions: issues.length > 0 ? ["Replace all placeholder URLs with real destination links."] : undefined,
      };
    });
  },
};
