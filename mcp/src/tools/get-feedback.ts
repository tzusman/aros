import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Storage } from "@aros/server/storage.js";

export function registerGetFeedback(server: McpServer, storage: Storage): void {
  server.tool(
    "get_feedback",
    "Retrieve feedback for a review. Returns the feedback object if available, or an error if no feedback exists yet.",
    {
      review_id: z.string().describe("The review ID to get feedback for"),
    },
    async (args) => {
      try {
        const feedback = await storage.readFeedback(args.review_id);
        if (!feedback) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "No feedback available yet for this review" }),
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(feedback),
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
