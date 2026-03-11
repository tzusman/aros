import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PipelineEngine } from "@aros/server/pipeline/engine.js";
import type { ReviewUrlFn } from "./index.js";

export function registerCompleteRevision(server: McpServer, engine: PipelineEngine, reviewUrl: ReviewUrlFn): void {
  server.tool(
    "complete_revision",
    "Mark a revision as complete and re-enter the pipeline. The review must be in 'revision_requested' stage. Call this after using submit_revision to update all necessary files.",
    {
      review_id: z.string().describe("The review ID in 'revision_requested' stage"),
    },
    async (args) => {
      try {
        const result = await engine.completeRevision(args.review_id);
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
