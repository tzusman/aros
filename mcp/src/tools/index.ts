import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Storage } from "@aros/server/storage.js";
import { PipelineEngine } from "@aros/server/pipeline/engine.js";
import { registerCreateReview } from "./create-review.js";
import { registerAddFile } from "./add-file.js";
import { registerSubmitForReview } from "./submit-for-review.js";
import { registerCheckStatus } from "./check-status.js";
import { registerGetFeedback } from "./get-feedback.js";
import { registerListMyReviews } from "./list-my-reviews.js";
import { registerReadFile } from "./read-file.js";
import { registerSubmitRevision } from "./submit-revision.js";
import { registerCompleteRevision } from "./complete-revision.js";
import { registerListPolicies } from "./list-policies.js";

export function registerAllTools(
  server: McpServer,
  storage: Storage,
  engine: PipelineEngine
): void {
  registerCreateReview(server, storage);
  registerAddFile(server, storage);
  registerSubmitForReview(server, engine);
  registerCheckStatus(server, storage);
  registerGetFeedback(server, storage);
  registerListMyReviews(server, storage);
  registerReadFile(server, storage);
  registerSubmitRevision(server, storage);
  registerCompleteRevision(server, engine);
  registerListPolicies(server, storage);
}
