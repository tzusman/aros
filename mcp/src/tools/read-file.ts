import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Storage } from "@aros/server/storage.js";

export function registerReadFile(server: McpServer, storage: Storage): void {
  server.tool(
    "read_file",
    "Read the contents of a file from a review. Returns the content along with its encoding and content type.",
    {
      review_id: z.string().describe("The review ID that contains the file"),
      filename: z.string().describe("The name of the file to read"),
    },
    async (args) => {
      try {
        const { content, encoding } = await storage.readFile(args.review_id, args.filename);

        // Determine content type from filename extension heuristic
        const ext = args.filename.split(".").pop()?.toLowerCase() ?? "";
        const contentTypeMap: Record<string, string> = {
          txt: "text/plain",
          md: "text/markdown",
          html: "text/html",
          htm: "text/html",
          css: "text/css",
          js: "text/javascript",
          ts: "text/typescript",
          json: "application/json",
          xml: "application/xml",
          pdf: "application/pdf",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          svg: "image/svg+xml",
          webp: "image/webp",
        };
        const content_type = contentTypeMap[ext] ?? "application/octet-stream";

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ content, content_type, encoding }),
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
