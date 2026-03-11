import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Storage } from "@aros/server/storage.js";

export function registerCheckStatus(server: McpServer, storage: Storage): void {
  server.tool(
    "check_status",
    "Check the current status of a review, including its stage, score, and revision number.",
    {
      review_id: z.string().describe("The review ID to check"),
    },
    async (args) => {
      try {
        const status = await storage.readStatus(args.review_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(status),
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
