import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Storage } from "@aros/server/storage.js";

export function registerListMyReviews(server: McpServer, storage: Storage): void {
  server.tool(
    "list_my_reviews",
    "List reviews, optionally filtered by source agent and/or stage.",
    {
      source_agent: z
        .string()
        .optional()
        .describe("Filter by source agent identifier"),
      stage: z
        .enum([
          "draft",
          "objective",
          "subjective",
          "human",
          "approved",
          "rejected",
          "revision_requested",
        ])
        .optional()
        .describe("Filter by stage"),
    },
    async (args) => {
      try {
        const reviews = await storage.listReviews({
          source_agent: args.source_agent,
          stage: args.stage,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ reviews }),
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
