// Match a content type against a MIME pattern.
// Patterns: exact (e.g., "text/markdown"), subtype wildcard (e.g., "text/*"), universal wildcard ("*/*").
export function matchMime(contentType: string, pattern: string): boolean {
  if (pattern === "*/*") return true;
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, pattern.indexOf("/"));
    return contentType.startsWith(prefix + "/");
  }
  return contentType === pattern;
}
