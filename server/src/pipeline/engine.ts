import * as path from "path";
import { Storage } from "../storage.js";
import { runObjectiveChecks } from "./objective.js";
import { runSubjectiveReview } from "./subjective.js";
import { getDriver } from "../notifications/driver.js";
import { loadAllChecks, loadCheckManifest } from "../modules/check-loader.js";
import { loadCriteriaLibrary } from "../modules/criteria-loader.js";
import { matchMime } from "../modules/mime-match.js";
import type {
  CheckModule,
  CriterionDef,
  DecisionPayload,
  Feedback,
  FileEntry,
  Stage,
  PolicyConfig,
} from "@aros/types";

export type SSEEmitFn = (event: string, data: Record<string, unknown>) => void;

export class PipelineEngine {
  private checkModules: Map<string, CheckModule> = new Map();
  private criteriaLibrary: Map<string, CriterionDef> = new Map();

  constructor(private storage: Storage, private emitSSE?: SSEEmitFn) {}

  async initModules(): Promise<void> {
    const modulesDir = path.join(this.storage.projectDir, ".aros", "modules");
    this.checkModules = await loadAllChecks(modulesDir);
    this.criteriaLibrary = loadCriteriaLibrary(modulesDir);
  }

  // ---- Public API ----

  /**
   * Called by submit_for_review MCP tool.
   * Transitions deliverable from "draft" through the pipeline.
   */
  async submit(id: string): Promise<{ stage: string; message: string }> {
    const meta = await this.storage.readMeta(id);
    const status = await this.storage.readStatus(id);

    if (status.stage !== "draft") {
      throw new Error(`Cannot submit: deliverable ${id} is in stage "${status.stage}", expected "draft"`);
    }

    const policy = await this.storage.readPolicy(meta.policy);

    // Emit submitted SSE
    this.emit("deliverable:submitted", { id, title: meta.title });

    // Advance pipeline from first stage
    return this.advancePipeline(id, policy, 0);
  }

  /**
   * Called by dashboard decision endpoint.
   * Human reviewer approves, rejects, or requests revision.
   */
  async decide(id: string, payload: DecisionPayload): Promise<void> {
    const meta = await this.storage.readMeta(id);
    const status = await this.storage.readStatus(id);
    const now = new Date().toISOString();

    const hasFeedback = payload.reason || (payload.issues && payload.issues.length > 0);

    if (payload.decision === "approved") {
      if (hasFeedback) {
        const feedback: Feedback = {
          stage: "human",
          decision: "approved",
          summary: payload.reason ?? "",
          issues: (payload.issues ?? []).map((i) => ({
            file: i.file ?? null,
            location: i.location ?? "",
            category: i.category,
            severity: i.severity,
            description: i.description,
            suggestion: i.suggestion ?? "",
          })),
          reviewer: "human",
          timestamp: now,
        };
        await this.storage.writeFeedback(id, feedback);
      }
      await this.storage.updateStatus(id, {
        stage: "approved",
        entered_stage_at: now,
        rejecting_stage: null,
      });
      await this.storage.moveToTerminal(id, "approved");
      this.emit("deliverable:decided", {
        id,
        title: meta.title,
        decision: "approved",
      });
      await this.notify(id, "approved");
    } else if (payload.decision === "rejected") {
      // Write feedback if reason or issues provided
      if (hasFeedback) {
        const feedback: Feedback = {
          stage: "human",
          decision: "rejected",
          summary: payload.reason ?? "",
          issues: (payload.issues ?? []).map((i) => ({
            file: i.file ?? null,
            location: i.location ?? "",
            category: i.category,
            severity: i.severity,
            description: i.description,
            suggestion: i.suggestion ?? "",
          })),
          reviewer: "human",
          timestamp: now,
        };
        await this.storage.writeFeedback(id, feedback);
      }
      await this.storage.updateStatus(id, {
        stage: "rejected",
        entered_stage_at: now,
        rejecting_stage: null,
      });
      this.emit("deliverable:decided", {
        id,
        title: meta.title,
        decision: "rejected",
      });
      await this.notify(id, "rejected");
      await this.storage.moveToTerminal(id, "rejected");
    } else if (payload.decision === "revision_requested") {
      // Write feedback if reason or issues provided
      if (hasFeedback) {
        const feedback: Feedback = {
          stage: "human",
          decision: "revision_requested",
          summary: payload.reason ?? "",
          issues: (payload.issues ?? []).map((i) => ({
            file: i.file ?? null,
            location: i.location ?? "",
            category: i.category,
            severity: i.severity,
            description: i.description,
            suggestion: i.suggestion ?? "",
          })),
          reviewer: "human",
          timestamp: now,
        };
        await this.storage.writeFeedback(id, feedback);
      }
      await this.storage.updateStatus(id, {
        stage: "revision_requested",
        entered_stage_at: now,
        rejecting_stage: "human",
      });
      this.emit("deliverable:decided", {
        id,
        title: meta.title,
        decision: "revision_requested",
      });
      await this.notify(id, "revision_requested");
    }
  }

  /**
   * Called by complete_revision MCP tool.
   * Re-enters the pipeline at the rejecting stage.
   */
  async completeRevision(id: string): Promise<{ stage: string; message: string }> {
    const status = await this.storage.readStatus(id);

    if (status.stage !== "revision_requested") {
      throw new Error(
        `Cannot complete revision for deliverable ${id}: current stage is "${status.stage}", expected "revision_requested"`
      );
    }

    const meta = await this.storage.readMeta(id);
    const policy = await this.storage.readPolicy(meta.policy);

    // Check if max revisions exceeded
    const newRevisionNumber = status.revision_number + 1;
    if (newRevisionNumber > policy.max_revisions) {
      // Auto-reject
      const now = new Date().toISOString();
      await this.storage.updateStatus(id, {
        stage: "rejected",
        entered_stage_at: now,
        rejecting_stage: null,
      });
      this.emit("deliverable:decided", {
        id,
        title: meta.title,
        decision: "rejected",
        reason: "max_revisions_exceeded",
      });
      await this.storage.moveToTerminal(id, "rejected");
      return {
        stage: "rejected",
        message: `Auto-rejected: max revisions (${policy.max_revisions}) exceeded`,
      };
    }

    // Increment revision number
    await this.storage.updateStatus(id, {
      revision_number: newRevisionNumber,
      entered_stage_at: new Date().toISOString(),
    });

    // Save history snapshot
    await this.storage.saveHistory(id, newRevisionNumber);

    // Emit revised SSE
    this.emit("deliverable:revised", {
      id,
      title: meta.title,
      revision_number: newRevisionNumber,
    });

    // Determine where to re-enter the pipeline
    const rejectingStage = status.rejecting_stage;

    if (rejectingStage === "human") {
      // Go DIRECTLY to human — do NOT re-run subjective
      const humanStageIndex = policy.stages.indexOf("human");
      if (humanStageIndex === -1) {
        // No human stage in policy (shouldn't happen if rejecting_stage is human)
        // but handle gracefully
        return this.advancePipeline(id, policy, 0);
      }
      return this.advancePipeline(id, policy, humanStageIndex);
    } else if (rejectingStage === "subjective") {
      // Re-run from subjective
      const subjectiveIndex = policy.stages.indexOf("subjective");
      if (subjectiveIndex === -1) {
        return this.advancePipeline(id, policy, 0);
      }
      return this.advancePipeline(id, policy, subjectiveIndex);
    } else {
      // "objective" or null — re-run from objective (or from the beginning)
      const objectiveIndex = policy.stages.indexOf("objective");
      if (objectiveIndex === -1) {
        return this.advancePipeline(id, policy, 0);
      }
      return this.advancePipeline(id, policy, objectiveIndex);
    }
  }

  // ---- Internal pipeline advancement ----

  /**
   * Iterates through policy.stages starting at stageIndex.
   * Returns when a terminal state is reached (human, revision_requested, approved).
   */
  private async advancePipeline(
    id: string,
    policy: PolicyConfig,
    startIndex: number
  ): Promise<{ stage: string; message: string }> {
    for (let i = startIndex; i < policy.stages.length; i++) {
      const stage = policy.stages[i];
      const result = await this.processStage(id, policy, stage);
      if (result !== null) {
        // Stage returned a terminal/halt result — propagate it up
        return result;
      }
      // result === null means stage passed, continue to next
    }

    // All stages passed with no human stage intervention — auto-approve
    const meta = await this.storage.readMeta(id);
    const now = new Date().toISOString();
    await this.storage.updateStatus(id, {
      stage: "approved",
      entered_stage_at: now,
      rejecting_stage: null,
    });
    await this.storage.moveToTerminal(id, "approved");
    this.emit("deliverable:decided", {
      id,
      title: meta.title,
      decision: "approved",
      automated: true,
    });
    return { stage: "approved", message: "Auto-approved: all stages passed" };
  }

  /**
   * Processes a single stage.
   * Returns null if the stage passed (pipeline should continue).
   * Returns { stage, message } if the pipeline should halt (human, revision_requested, approved).
   */
  private async processStage(
    id: string,
    policy: PolicyConfig,
    stage: Stage
  ): Promise<{ stage: string; message: string } | null> {
    const now = new Date().toISOString();

    await this.storage.updateStatus(id, {
      stage,
      entered_stage_at: now,
    });

    this.emit("deliverable:stage_changed", { id, stage });

    if (stage === "objective") {
      return this.runObjectiveStage(id, policy, now);
    } else if (stage === "subjective") {
      return this.runSubjectiveStage(id, policy, now);
    } else if (stage === "human") {
      return this.runHumanStage(id, now);
    }

    // Unknown stage — skip
    return null;
  }

  private async runObjectiveStage(
    id: string,
    policy: PolicyConfig,
    now: string
  ): Promise<{ stage: string; message: string } | null> {
    const objectiveConfig = policy.objective;
    if (!objectiveConfig) {
      // No objective config — skip
      return null;
    }

    // Use module-based checks if modules are loaded
    if (this.checkModules.size > 0) {
      const passed = await this.runObjectiveWithModules(id, policy);
      if (!passed) {
        return {
          stage: "revision_requested",
          message: "Objective checks failed",
        };
      }
      return null;
    }

    // Gather files
    const files = await this.storage.listFiles(id);
    const fileInputs = await Promise.all(
      files.map(async (f) => {
        const { content } = await this.storage.readFile(id, f.filename);
        // Detect content type from mime-types or use extension heuristic
        const contentType = detectContentType(f.filename);
        const sizeBytes = f.size_bytes;
        return {
          filename: f.filename,
          content,
          contentType,
          sizeBytes,
        };
      })
    );

    const checks = objectiveConfig.checks;
    const results = await runObjectiveChecks(fileInputs, checks);
    await this.storage.writeObjectiveResults(id, results);

    // Count blocking failures
    const failThreshold = objectiveConfig.fail_threshold ?? 1;
    const blockingFailures = results.filter(
      (r) => r.severity === "blocking" && !r.passed
    ).length;

    if (blockingFailures >= failThreshold) {
      // Fail — request revision
      const meta = await this.storage.readMeta(id);
      const failedChecks = results
        .filter((r) => r.severity === "blocking" && !r.passed)
        .map((r) => r.name)
        .join(", ");

      const feedback: Feedback = {
        stage: "objective",
        decision: "revision_requested",
        summary: `Objective checks failed: ${failedChecks}`,
        issues: results
          .filter((r) => !r.passed)
          .map((r) => ({
            file: null,
            location: "file",
            category: r.name,
            severity: r.severity === "blocking" ? ("critical" as const) : ("minor" as const),
            description: r.details,
            suggestion: "Fix the reported issue and resubmit",
          })),
        reviewer: "system",
        timestamp: now,
      };
      await this.storage.writeFeedback(id, feedback);

      await this.storage.updateStatus(id, {
        stage: "revision_requested",
        entered_stage_at: now,
        rejecting_stage: "objective",
      });

      this.emit("deliverable:stage_changed", {
        id,
        title: meta.title,
        stage: "revision_requested",
        reason: "objective_failed",
      });

      return {
        stage: "revision_requested",
        message: `Objective checks failed (${blockingFailures} blocking failure(s))`,
      };
    }

    // All checks passed — continue
    return null;
  }

  private async runObjectiveWithModules(id: string, policy: PolicyConfig): Promise<boolean> {
    const files = await this.storage.listFiles(id);
    const brief = (await this.storage.readMeta(id)).brief;
    const modulesDir = path.join(this.storage.projectDir, ".aros", "modules");
    const results: import("@aros/types").ObjectiveCheck[] = [];

    for (const policyCheck of policy.objective?.checks ?? []) {
      const mod = this.checkModules.get(policyCheck.name);
      if (!mod) {
        results.push({
          name: policyCheck.name,
          passed: false,
          severity: policyCheck.severity,
          details: `Module not installed: ${policyCheck.name}`,
          file: null,
        });
        continue;
      }

      const manifest = loadCheckManifest(modulesDir, policyCheck.name);
      const fileEntries: FileEntry[] = [];
      for (const f of files) {
        const ct = f.content_type || detectContentType(f.filename);
        if (manifest.supportedTypes.some((p: string) => matchMime(ct, p))) {
          const data = await this.storage.readFile(id, f.filename);
          fileEntries.push({
            filename: f.filename,
            content: data.content,
            contentType: ct,
            sizeBytes: f.size_bytes,
          });
        }
      }
      if (fileEntries.length === 0) continue;

      const checkResults = await mod.execute({
        files: fileEntries,
        config: policyCheck.config ?? {},
        brief,
        projectDir: this.storage.projectDir,
      });

      for (const r of checkResults) {
        results.push({ ...r, severity: policyCheck.severity });
      }
    }

    await this.storage.writeObjectiveResults(id, results);

    const blockingFailures = results.filter((r) => !r.passed && r.severity === "blocking");
    const threshold = policy.objective?.fail_threshold ?? 1;
    if (blockingFailures.length >= threshold) {
      const allFailures = results.filter((r) => !r.passed);
      const feedback: Feedback = {
        stage: "objective",
        decision: "revision_requested",
        summary: `Objective checks failed: ${blockingFailures.length} blocking failure(s).`,
        issues: allFailures.map((r) => ({
          file: r.file ?? null,
          location: "",
          category: r.name,
          severity: r.severity === "blocking" ? ("critical" as const) : ("minor" as const),
          description: r.details,
          suggestion: r.suggestions?.[0] ?? "",
        })),
        reviewer: "objective-pipeline",
        timestamp: new Date().toISOString(),
      };
      await this.storage.writeFeedback(id, feedback);
      await this.storage.updateStatus(id, {
        stage: "revision_requested",
        rejecting_stage: "objective",
        entered_stage_at: new Date().toISOString(),
      });
      this.emit("deliverable:stage_changed", { id, to_stage: "revision_requested" });
      return false;
    }
    return true;
  }

  private async runSubjectiveStage(
    id: string,
    policy: PolicyConfig,
    now: string
  ): Promise<{ stage: string; message: string } | null> {
    const subjectiveConfig = policy.subjective;
    if (!subjectiveConfig) {
      // No subjective config — skip
      return null;
    }

    const meta = await this.storage.readMeta(id);
    const config = await this.storage.getConfig();

    // Gather content blocks for subjective review
    const files = await this.storage.listFiles(id);
    const contentBlocks = await Promise.all(
      files.map(async (f) => {
        const { content, encoding } = await this.storage.readFile(id, f.filename);
        const contentType = detectContentType(f.filename);
        if (encoding === "base64" && contentType.startsWith("image/")) {
          return {
            type: "image" as const,
            content,
            mediaType: contentType,
          };
        }
        return {
          type: "text" as const,
          content,
        };
      })
    );

    const result = await runSubjectiveReview(
      meta.brief,
      contentBlocks,
      subjectiveConfig.criteria,
      config.subjective_model
    );

    if ("skipped" in result) {
      // Subjective review was skipped (no API key) — continue pipeline
      return null;
    }

    // Save results and update score
    await this.storage.writeSubjectiveResults(id, result.results);
    await this.storage.updateStatus(id, { score: result.score });

    const passThreshold = subjectiveConfig.pass_threshold;
    if (result.score < passThreshold) {
      // Below threshold — request revision
      const feedback: Feedback = {
        stage: "subjective",
        decision: "revision_requested",
        summary: `Subjective score ${result.score.toFixed(2)} below threshold ${passThreshold}`,
        issues: [],
        reviewer: "system",
        timestamp: now,
      };
      await this.storage.writeFeedback(id, feedback);

      await this.storage.updateStatus(id, {
        stage: "revision_requested",
        entered_stage_at: now,
        rejecting_stage: "subjective",
      });

      this.emit("deliverable:stage_changed", {
        id,
        title: meta.title,
        stage: "revision_requested",
        reason: "subjective_failed",
        score: result.score,
      });

      return {
        stage: "revision_requested",
        message: `Subjective score ${result.score.toFixed(2)} below threshold ${passThreshold}`,
      };
    }

    // Score passes threshold — continue
    return null;
  }

  private async runHumanStage(
    id: string,
    now: string
  ): Promise<{ stage: string; message: string }> {
    const meta = await this.storage.readMeta(id);

    await this.storage.updateStatus(id, {
      stage: "human",
      entered_stage_at: now,
    });

    this.emit("deliverable:stage_changed", {
      id,
      title: meta.title,
      stage: "human",
    });

    // Human review halts the pipeline — waiting for decide()
    return {
      stage: "human",
      message: "Waiting for human review",
    };
  }

  // ---- Notification ----

  private async notify(
    id: string,
    event: "approved" | "revision_requested" | "rejected"
  ): Promise<void> {
    const meta = await this.storage.readMeta(id);
    const notifConfig = meta.notification;

    if (!notifConfig) return;
    if (!notifConfig.events.includes(event)) return;

    const driver = getDriver(notifConfig.driver);
    if (!driver) return;

    const status = await this.storage.readStatus(id);
    const feedback = await this.storage.readFeedback(id);

    try {
      await driver.send(
        event,
        {
          review_id: id,
          title: meta.title,
          revision_number: status.revision_number,
        },
        feedback,
        notifConfig.target
      );
    } catch {
      // Notification failure is non-fatal — log silently
    }
  }

  // ---- SSE helper ----

  private emit(event: string, data: Record<string, unknown>): void {
    if (this.emitSSE) {
      this.emitSSE(event, data);
    }
  }
}

// ---- Content type detection ----

/**
 * Simple content type detection based on file extension.
 * Used when content_type is not stored per-file.
 */
function detectContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".ts": "text/typescript",
    ".json": "application/json",
    ".xml": "application/xml",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".zip": "application/zip",
  };
  return map[ext] ?? "application/octet-stream";
}
