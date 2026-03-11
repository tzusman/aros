import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PipelineEngine } from "@aros/server/pipeline/engine.js";
import type { ReviewUrlFn } from "./index.js";

export function registerSubmitForReview(server: McpServer, engine: PipelineEngine, reviewUrl: ReviewUrlFn): void {
  server.tool(
    "submit_for_review",
    "Submit a draft review for processing through the pipeline. Prefer submit_deliverable instead — it combines create, add files, and submit in one call. Use this only after manually calling create_review and add_file.",
    {
      review_id: z.string().describe("The review ID to submit"),
    },
    async (args) => {
      try {
        const result = await engine.submit(args.review_id);
        const url = await reviewUrl(args.review_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                stage: result.stage,
                message: result.message,
                review_url: url,
              }),
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
