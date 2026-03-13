import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Storage } from "@aros/server/storage.js";
import { readFile } from "fs/promises";
import * as path from "path";

export function registerListPolicies(server: McpServer, storage: Storage): void {
  server.tool(
    "list_policies",
    "List all installed review policies. Returns policy names, stages, and configuration. " +
      "Call this before submit_deliverable to choose the right policy for your content.",
    {},
    async () => {
      try {
        const names = await storage.listPolicies();
        const policies = await Promise.all(
          names.map(async (name) => {
            const config = await storage.readPolicy(name);
            // Read full manifest for usage_hint
            let usage_hint: string | undefined;
            try {
              // Guard against path traversal via unsanitized policy name
              if (/[/\\]|\.\./.test(name)) {
                throw new Error(`Unsafe policy name: ${name}`);
              }
              const manifestPath = path.join(
                storage.projectDir, ".aros", "modules", "policies", name, "manifest.json"
              );
              const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
              usage_hint = manifest.usage_hint;
            } catch { /* no manifest — installed before usage_hint existed */ }
            return {
              name: config.name,
              usage_hint,
              stages: config.stages,
              max_revisions: config.max_revisions,
              objective_checks: config.objective?.checks?.map((c) => c.name) ?? [],
              subjective_criteria: config.subjective?.criteria?.map((c) => c.name) ?? [],
              pass_threshold: config.subjective?.pass_threshold ?? null,
            };
          })
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ policies }),
            },
          ],
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error }) }],
          isError: true,
        };
      }
    }
  );
}
