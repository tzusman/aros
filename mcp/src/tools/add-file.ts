import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Storage } from "@aros/server/storage.js";

export function registerAddFile(server: McpServer, storage: Storage): void {
  server.tool(
    "add_file",
    "Add a file to an existing review. Files can be added before submitting for review.",
    {
      review_id: z.string().describe("The review ID returned by create_review"),
      filename: z.string().describe("The name of the file (e.g. 'output.png', 'report.md')"),
      content: z.string().describe("File content — UTF-8 text or base64-encoded binary"),
      content_type: z.string().describe("MIME type of the file (e.g. 'image/png', 'text/markdown')"),
      encoding: z
        .enum(["utf-8", "base64"])
        .default("utf-8")
        .describe("Encoding of the content field — 'utf-8' for text, 'base64' for binary"),
    },
    async (args) => {
      try {
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
