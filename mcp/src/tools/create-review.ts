import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Storage } from "@aros/server/storage.js";
import { getDriver } from "@aros/server/notifications/driver.js";
import type { ReviewUrlFn } from "./index.js";

export function registerCreateReview(server: McpServer, storage: Storage, reviewUrl: ReviewUrlFn): void {
  server.tool(
    "create_review",
    "Create a new review draft. Returns a review_id for use with add_file and submit_for_review. Prefer submit_deliverable instead — it combines create, add files, and submit in one call.",
    {
      title: z.string().describe("Title of the deliverable"),
      brief: z.string().describe("Brief description or requirements for the deliverable"),
      policy: z.string().default("default").describe("Policy name to apply (defaults to 'default')"),
      source_agent: z.string().describe("Identifier for the agent submitting the deliverable"),
      content_type: z.string().describe("MIME type or description of the content (e.g. 'image/png', 'text/markdown')"),
      folder_strategy: z
        .enum(["all_pass", "select", "rank", "categorize"])
        .optional()
        .describe("Folder review strategy when multiple files are submitted"),
      notification_driver: z.string().optional().describe("Notification driver name (e.g. 'paperclip')"),
      notification_target: z
        .record(z.unknown())
        .optional()
        .describe("Notification target config object (driver-specific fields)"),
      notification_events: z
        .array(z.enum(["approved", "revision_requested", "rejected"]))
        .optional()
        .describe("Which events to trigger notifications for"),
    },
    async (args) => {
      try {
        // Validate notification target if provided
        if (args.notification_driver && args.notification_target) {
          const driver = getDriver(args.notification_driver);
          if (!driver) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: `Unknown notification driver: ${args.notification_driver}` }),
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
                  text: JSON.stringify({ error: `Invalid notification target: ${validation.error}` }),
                },
              ],
              isError: true,
            };
          }
        }

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
                  events: args.notification_events ?? ["approved", "revision_requested", "rejected"],
                },
              }
            : {}),
        };

        const review_id = await storage.createReview(meta);
        const url = await reviewUrl(review_id);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ review_id, review_url: url }),
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
