import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Storage } from "@aros/server/storage.js";

export function registerListPolicies(server: McpServer, storage: Storage): void {
  server.tool(
    "list_policies",
    "List all available review policies. Policy names can be used when creating a review.",
    {},
    async () => {
      try {
        const names = await storage.listPolicies();
        const policies = await Promise.all(
          names.map(async (name) => {
            const config = await storage.readPolicy(name);
            return {
              name: config.name,
              stages: config.stages,
              max_revisions: config.max_revisions,
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
