import type { Feedback } from "@aros/types";
import type { NotificationDriver } from "./driver.js";

function buildCommentBody(
  event: "approved" | "revision_requested" | "rejected",
  deliverable: { review_id: string; title: string; revision_number: number },
  feedback: Feedback | null
): string {
  const eventLabel: Record<typeof event, string> = {
    approved: "Approved",
    revision_requested: "Revision Requested",
    rejected: "Rejected",
  };

  const lines: string[] = [
    `## AROS Review: ${eventLabel[event]}`,
    "",
    `**Deliverable:** ${deliverable.title}`,
    `**Review ID:** ${deliverable.review_id}`,
    `**Revision:** ${deliverable.revision_number}`,
    "",
  ];

  if (feedback) {
    lines.push(`**Summary:** ${feedback.summary}`, "");

    if (feedback.issues.length > 0) {
      lines.push("### Issues", "");
      for (const issue of feedback.issues) {
        const file = issue.file ? ` (${issue.file})` : "";
        lines.push(
          `- **[${issue.severity.toUpperCase()}]** ${issue.description}${file}`,
          `  - Location: ${issue.location}`,
          `  - Category: ${issue.category}`,
          `  - Suggestion: ${issue.suggestion}`,
          ""
        );
      }
    }
  }

  return lines.join("\n");
}

export const paperclipDriver: NotificationDriver = {
  name: "paperclip",

  validateTarget(target: Record<string, unknown>): { valid: boolean; error?: string } {
    const required = ["api_url", "company_id", "issue_id"];
    for (const field of required) {
      if (!target[field]) {
        return { valid: false, error: `Missing required target field: ${field}` };
      }
    }
    return { valid: true };
  },

  async send(
    event: "approved" | "revision_requested" | "rejected",
    deliverable: { review_id: string; title: string; revision_number: number },
    feedback: Feedback | null,
    target: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    const api_url = target["api_url"] as string;
    const company_id = target["company_id"] as string;
    const issue_id = target["issue_id"] as string;

    const commentsUrl = `${api_url}/api/companies/${company_id}/issues/${issue_id}/comments`;
    const issueUrl = `${api_url}/api/companies/${company_id}/issues/${issue_id}`;

    const body = buildCommentBody(event, deliverable, feedback);

    try {
      // Post comment
      const commentRes = await fetch(commentsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });

      if (!commentRes.ok) {
        return {
          success: false,
          error: `Paperclip comment POST failed: ${commentRes.status} ${commentRes.statusText}`,
        };
      }

      // Patch issue status for approved / rejected
      if (event === "approved" || event === "rejected") {
        const newStatus = event === "approved" ? "done" : "blocked";

        const patchRes = await fetch(issueUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });

        if (!patchRes.ok) {
          return {
            success: false,
            error: `Paperclip issue PATCH failed: ${patchRes.status} ${patchRes.statusText}`,
          };
        }
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Paperclip fetch error: ${message}` };
    }
  },
};
