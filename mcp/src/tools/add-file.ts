import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Storage } from "@aros/server/storage.js";

export function registerAddFile(server: McpServer, storage: Storage): void {
  server.tool(
    "add_file",
    "Add a file to a review draft created by create_review. Prefer submit_deliverable instead — it handles file attachment automatically. Use this only when you need to add files incrementally.",
    {
      review_id: z.string().describe("The review ID returned by create_review"),
      filename: z
        .string()
        .optional()
        .describe(
          "Name for the file in the review (e.g. 'report.md'). Required when using content, optional with source_path (defaults to the source filename)"
        ),
      source_path: z
        .string()
        .optional()
        .describe(
          "Absolute path to a file on disk. AROS will copy it into the review. Preferred for large files, images, and binaries"
        ),
      content: z
        .string()
        .optional()
        .describe("Inline file content — UTF-8 text or base64-encoded binary. Use source_path instead for large files"),
      content_type: z
        .string()
        .optional()
        .describe("MIME type (e.g. 'image/png', 'text/markdown'). Auto-detected from filename if omitted"),
      encoding: z
        .enum(["utf-8", "base64"])
        .default("utf-8")
        .describe("Encoding of the content field — 'utf-8' for text, 'base64' for binary. Ignored when using source_path"),
    },
    async (args) => {
      try {
        // Validate: must provide exactly one of source_path or content
        if (args.source_path && args.content) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Provide either source_path or content, not both",
                }),
              },
            ],
            isError: true,
          };
        }

        if (!args.source_path && !args.content) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Provide either source_path (for files on disk) or content (for inline text)",
                }),
              },
            ],
            isError: true,
          };
        }

        if (args.source_path) {
          // File path mode — copy from disk
          const result = await storage.addFileFromPath(
            args.review_id,
            args.source_path,
            args.filename
          );

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ok: true,
                  filename: result.filename,
                  size_bytes: result.size_bytes,
                }),
              },
            ],
          };
        }

        // Inline content mode
        if (!args.filename) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "filename is required when using inline content",
                }),
              },
            ],
            isError: true,
          };
        }

        await storage.addFile(
          args.review_id,
          args.filename,
          args.content!,
          args.content_type ?? "application/octet-stream",
          args.encoding
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, filename: args.filename }),
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
