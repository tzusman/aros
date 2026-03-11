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
import { registerSubmitDeliverable } from "./submit-deliverable.js";

export type ReviewUrlFn = (id: string) => Promise<string>;

async function createReviewUrlFn(storage: Storage): Promise<ReviewUrlFn> {
  let port = 4100;
  try {
    const config = await storage.getConfig();
    port = config.port ?? 4100;
  } catch {
    // default
  }
  return (id: string) => Promise.resolve(`http://localhost:${port}/reviews/${id}`);
}

export async function registerAllTools(
  server: McpServer,
  storage: Storage,
  engine: PipelineEngine
): Promise<void> {
  const reviewUrl = await createReviewUrlFn(storage);

  registerCreateReview(server, storage, reviewUrl);
  registerAddFile(server, storage);
  registerSubmitForReview(server, engine, reviewUrl);
  registerCheckStatus(server, storage, reviewUrl);
  registerGetFeedback(server, storage);
  registerListMyReviews(server, storage);
  registerReadFile(server, storage);
  registerSubmitRevision(server, storage);
  registerCompleteRevision(server, engine, reviewUrl);
  registerListPolicies(server, storage);
  registerSubmitDeliverable(server, storage, engine, reviewUrl);
}
