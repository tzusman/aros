import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Storage } from "@aros/server/storage.js";
import { PipelineEngine } from "@aros/server/pipeline/engine.js";
import { getDriver } from "@aros/server/notifications/driver.js";
import type { ReviewUrlFn } from "./index.js";

const fileSchema = z.object({
  source_path: z
    .string()
    .optional()
    .describe(
      "Absolute path to a file on disk. AROS copies it into the review. Preferred for large files, images, and binaries"
    ),
  content: z
    .string()
    .optional()
    .describe("Inline file content (UTF-8 text or base64). Use source_path for large files"),
  filename: z
    .string()
    .optional()
    .describe(
      "Name for the file (e.g. 'report.md'). Required with inline content, optional with source_path (defaults to source filename)"
    ),
  content_type: z
    .string()
    .optional()
    .describe("MIME type. Auto-detected from filename if omitted"),
  encoding: z
    .enum(["utf-8", "base64"])
    .default("utf-8")
    .describe("Encoding of content field. Ignored with source_path"),
});

export function registerSubmitDeliverable(
  server: McpServer,
  storage: Storage,
  engine: PipelineEngine,
  reviewUrl: ReviewUrlFn
): void {
  server.tool(
    "submit_deliverable",
    "All-in-one: create a review, attach files, and submit to the pipeline in a single call. " +
      "Use this instead of calling create_review + add_file + submit_for_review separately.",
    {
      title: z.string().describe("Title of the deliverable"),
      brief: z.string().describe("Brief description or requirements for the deliverable"),
      policy: z.string().default("default").describe("Policy name (defaults to 'default')"),
      source_agent: z.string().describe("Identifier for the submitting agent"),
      content_type: z
        .string()
        .describe("MIME type or description of the content (e.g. 'image/png', 'text/markdown')"),
      files: z
        .array(fileSchema)
        .min(1)
        .describe(
          "Files to attach. Each needs either source_path (for files on disk) or content + filename (for inline)"
        ),
      folder_strategy: z
        .enum(["all_pass", "select", "rank", "categorize"])
        .optional()
        .describe("Folder review strategy when multiple files are submitted"),
      notification_driver: z.string().optional().describe("Notification driver name"),
      notification_target: z
        .record(z.unknown())
        .optional()
        .describe("Notification target config (driver-specific)"),
      notification_events: z
        .array(z.enum(["approved", "revision_requested", "rejected"]))
        .optional()
        .describe("Events to trigger notifications for"),
    },
    async (args) => {
      try {
        // Validate notification config
        if (args.notification_driver && args.notification_target) {
          const driver = getDriver(args.notification_driver);
          if (!driver) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: `Unknown notification driver: ${args.notification_driver}`,
                  }),
                },
              ],
              isError: true,
            };
          }
          const validation = driver.validateTarget(args.notification_target);
          if (!validation.valid) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: `Invalid notification target: ${validation.error}`,
                  }),
                },
              ],
              isError: true,
            };
          }
        }

        // Validate each file entry
        for (let i = 0; i < args.files.length; i++) {
          const f = args.files[i];
          if (f.source_path && f.content) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: `files[${i}]: provide either source_path or content, not both`,
                  }),
                },
              ],
              isError: true,
            };
          }
          if (!f.source_path && !f.content) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: `files[${i}]: provide either source_path or content`,
                  }),
                },
              ],
              isError: true,
            };
          }
          if (!f.source_path && !f.filename) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: `files[${i}]: filename is required when using inline content`,
                  }),
                },
              ],
              isError: true,
            };
          }
        }

        // 1. Create review
        const meta = {
          title: args.title,
          brief: args.brief,
          policy: args.policy,
          source_agent: args.source_agent,
          content_type: args.content_type,
          ...(args.folder_strategy ? { folder_strategy: args.folder_strategy } : {}),
          ...(args.notification_driver && args.notification_target
            ? {
                notification: {
                  driver: args.notification_driver,
                  target: args.notification_target,
                  events: args.notification_events ?? [
                    "approved",
                    "revision_requested",
                    "rejected",
                  ],
                },
              }
            : {}),
        };

        const review_id = await storage.createReview(meta);

        // 2. Add files
        const addedFiles: Array<{ filename: string; size_bytes?: number }> = [];
        for (const f of args.files) {
          if (f.source_path) {
            const result = await storage.addFileFromPath(review_id, f.source_path, f.filename);
            addedFiles.push(result);
          } else {
            await storage.addFile(
              review_id,
              f.filename!,
              f.content!,
              f.content_type ?? "application/octet-stream",
              f.encoding
            );
            addedFiles.push({ filename: f.filename! });
          }
        }

        // 3. Submit to pipeline
        const result = await engine.submit(review_id);
        const url = await reviewUrl(review_id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                review_id,
                review_url: url,
                stage: result.stage,
                message: result.message,
                files_added: addedFiles.length,
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
