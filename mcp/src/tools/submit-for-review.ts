import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PipelineEngine } from "@aros/server/pipeline/engine.js";

export function registerSubmitForReview(server: McpServer, engine: PipelineEngine): void {
  server.tool(
    "submit_for_review",
    "Submit a review for processing through the pipeline. The deliverable must be in 'draft' stage with at least one file added.",
    {
      review_id: z.string().describe("The review ID to submit"),
    },
    async (args) => {
      try {
        const result = await engine.submit(args.review_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ stage: result.stage, message: result.message }),
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
