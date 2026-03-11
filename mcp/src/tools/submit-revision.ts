import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Storage } from "@aros/server/storage.js";

export function registerSubmitRevision(server: McpServer, storage: Storage): void {
  server.tool(
    "submit_revision",
    "Submit a revised file for a review that is in 'revision_requested' stage. Saves the current file to history and replaces it with the new content.",
    {
      review_id: z.string().describe("The review ID in 'revision_requested' stage"),
      filename: z.string().describe("The filename to revise"),
      content: z.string().describe("New file content — UTF-8 text or base64-encoded binary"),
      content_type: z.string().describe("MIME type of the file"),
      encoding: z
        .enum(["utf-8", "base64"])
        .default("utf-8")
        .describe("Encoding of the content field — 'utf-8' for text, 'base64' for binary"),
    },
    async (args) => {
      try {
        const status = await storage.readStatus(args.review_id);

        if (status.stage !== "revision_requested") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `Cannot submit revision: review is in stage '${status.stage}', expected 'revision_requested'`,
                }),
              },
            ],
            isError: true,
          };
        }

        // Save current file to history before replacing
        try {
          await storage.saveFileToHistory(
            args.review_id,
            args.filename,
            status.revision_number
          );
        } catch {
          // File might not exist yet (first add) — that's fine
        }

        // Write the revised file
        await storage.addFile(
          args.review_id,
          args.filename,
          args.content,
          args.content_type,
          args.encoding
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, path: args.filename }),
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
