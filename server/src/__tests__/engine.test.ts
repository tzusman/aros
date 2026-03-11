import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Storage } from "../storage.js";
import { PipelineEngine } from "../pipeline/engine.js";
import type { PolicyConfig } from "@aros/types";

// ---- Test helpers ----

let tmpDir: string;
let storage: Storage;
let engine: PipelineEngine;
const sseEvents: Array<{ event: string; data: Record<string, unknown> }> = [];

function captureSSE(event: string, data: Record<string, unknown>) {
  sseEvents.push({ event, data });
}

async function setupReview(opts?: {
  policy?: PolicyConfig;
  policyName?: string;
  files?: Array<{ name: string; content: string; contentType: string }>;
}) {
  const policyName = opts?.policyName ?? "test-policy";

  const policy: PolicyConfig = opts?.policy ?? {
    name: policyName,
    stages: ["objective", "subjective", "human"],
    max_revisions: 3,
    objective: {
      checks: [
        {
          name: "file_size",
          config: { max_mb: 10 },
          severity: "blocking",
        },
        {
          name: "format_check",
          config: { allowed: ["text/*", "image/*", "application/pdf"] },
          severity: "blocking",
        },
      ],
      fail_threshold: 1,
    },
    subjective: {
      criteria: [
        {
          name: "relevance",
          description: "Relevance",
          weight: 1,
          scale: 10,
        },
      ],
      pass_threshold: 6.0,
    },
    human: { required: true },
  };

  await storage.writePolicy(policyName, policy);

  const id = await storage.createReview({
    title: "Test deliverable",
    brief: "A test brief",
    policy: policyName,
    source_agent: "test-agent",
    content_type: "text/plain",
  });

  const files = opts?.files ?? [
    { name: "output.txt", content: "Hello world content", contentType: "text/plain" },
  ];

  for (const file of files) {
    await storage.addFile(id, file.name, file.content, file.contentType, "utf-8");
  }

  return { id, policy };
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-engine-test-"));
  storage = new Storage(tmpDir);
  await storage.init();
  sseEvents.length = 0;
  engine = new PipelineEngine(storage, captureSSE);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---- Test 1: submit advances through objective stage (text file passes) ----

describe("submit()", () => {
  it("advances through objective stage when text file passes all checks", async () => {
    const { id } = await setupReview();

    const result = await engine.submit(id);

    // Should reach human stage (since subjective skips without API key, and policy has human stage)
    expect(result.stage).toBe("human");

    const status = await storage.readStatus(id);
    expect(status.stage).toBe("human");

    // SSE events should include submitted event
    const submittedEvent = sseEvents.find((e) => e.event === "deliverable:submitted");
    expect(submittedEvent).toBeDefined();
    expect(submittedEvent?.data.id).toBe(id);
  });

  it("goes to revision_requested when objective fails (image-only policy, .txt file)", async () => {
    const imageOnlyPolicy: PolicyConfig = {
      name: "image-only",
      stages: ["objective"],
      max_revisions: 3,
      objective: {
        checks: [
          {
            name: "format_check",
            config: { allowed: ["image/*"] },
            severity: "blocking",
          },
        ],
        fail_threshold: 1,
      },
    };

    const { id } = await setupReview({
      policy: imageOnlyPolicy,
      policyName: "image-only",
      files: [{ name: "doc.txt", content: "text content", contentType: "text/plain" }],
    });

    const result = await engine.submit(id);

    expect(result.stage).toBe("revision_requested");

    const status = await storage.readStatus(id);
    expect(status.stage).toBe("revision_requested");
    expect(status.rejecting_stage).toBe("objective");
  });

  it("emits deliverable:submitted SSE event on submit", async () => {
    const { id } = await setupReview();

    await engine.submit(id);

    const submittedEvent = sseEvents.find((e) => e.event === "deliverable:submitted");
    expect(submittedEvent).toBeDefined();
    expect(submittedEvent?.data.id).toBe(id);
  });

  it("auto-approves when all stages pass and no human stage in policy", async () => {
    const noHumanPolicy: PolicyConfig = {
      name: "no-human",
      stages: ["objective"],
      max_revisions: 3,
      objective: {
        checks: [
          {
            name: "format_check",
            config: { allowed: ["text/*"] },
            severity: "blocking",
          },
        ],
        fail_threshold: 1,
      },
    };

    const { id } = await setupReview({
      policy: noHumanPolicy,
      policyName: "no-human",
      files: [{ name: "doc.txt", content: "text content", contentType: "text/plain" }],
    });

    const result = await engine.submit(id);

    expect(result.stage).toBe("approved");

    const status = await storage.readStatus(id);
    expect(status.stage).toBe("approved");
  });
});

// ---- Test 3: decide("approved") ----

describe('decide("approved")', () => {
  it("sets status to approved and copies content to approved/", async () => {
    const { id } = await setupReview();
    await engine.submit(id);

    await engine.decide(id, { decision: "approved" });

    const status = await storage.readStatus(id);
    expect(status.stage).toBe("approved");

    // Check content was copied to approved/
    const approvedContentPath = path.join(tmpDir, ".aros", "approved", id, "content", "output.txt");
    expect(fs.existsSync(approvedContentPath)).toBe(true);
  });

  it("emits deliverable:decided SSE event with decision=approved", async () => {
    const { id } = await setupReview();
    await engine.submit(id);
    sseEvents.length = 0;

    await engine.decide(id, { decision: "approved" });

    const decidedEvent = sseEvents.find((e) => e.event === "deliverable:decided");
    expect(decidedEvent).toBeDefined();
    expect(decidedEvent?.data.decision).toBe("approved");
    expect(decidedEvent?.data.id).toBe(id);
  });
});

// ---- Test 4: decide("revision_requested") ----

describe('decide("revision_requested")', () => {
  it("sets status to revision_requested with rejecting_stage=human", async () => {
    const { id } = await setupReview();
    await engine.submit(id);

    await engine.decide(id, {
      decision: "revision_requested",
      reason: "Please improve quality",
    });

    const status = await storage.readStatus(id);
    expect(status.stage).toBe("revision_requested");
    expect(status.rejecting_stage).toBe("human");
  });

  it("writes feedback when reason is provided", async () => {
    const { id } = await setupReview();
    await engine.submit(id);

    await engine.decide(id, {
      decision: "revision_requested",
      reason: "Needs more detail",
    });

    const feedback = await storage.readFeedback(id);
    expect(feedback).not.toBeNull();
    expect(feedback?.decision).toBe("revision_requested");
    expect(feedback?.summary).toBe("Needs more detail");
  });

  it("emits deliverable:decided SSE event", async () => {
    const { id } = await setupReview();
    await engine.submit(id);
    sseEvents.length = 0;

    await engine.decide(id, { decision: "revision_requested" });

    const decidedEvent = sseEvents.find((e) => e.event === "deliverable:decided");
    expect(decidedEvent).toBeDefined();
    expect(decidedEvent?.data.decision).toBe("revision_requested");
  });
});

// ---- Test 5: decide("rejected") ----

describe('decide("rejected")', () => {
  it("sets status to rejected and copies content to rejected/", async () => {
    const { id } = await setupReview();
    await engine.submit(id);

    await engine.decide(id, { decision: "rejected", reason: "Does not meet standards" });

    const status = await storage.readStatus(id);
    expect(status.stage).toBe("rejected");

    // Check content was copied to rejected/
    const rejectedMetaPath = path.join(tmpDir, ".aros", "rejected", id, "meta.json");
    expect(fs.existsSync(rejectedMetaPath)).toBe(true);
  });

  it("writes feedback for rejected decision", async () => {
    const { id } = await setupReview();
    await engine.submit(id);

    await engine.decide(id, { decision: "rejected", reason: "Rejected: poor quality" });

    const feedback = await storage.readFeedback(id);
    expect(feedback).not.toBeNull();
    expect(feedback?.decision).toBe("rejected");
  });

  it("emits deliverable:decided SSE event with decision=rejected", async () => {
    const { id } = await setupReview();
    await engine.submit(id);
    sseEvents.length = 0;

    await engine.decide(id, { decision: "rejected" });

    const decidedEvent = sseEvents.find((e) => e.event === "deliverable:decided");
    expect(decidedEvent).toBeDefined();
    expect(decidedEvent?.data.decision).toBe("rejected");
  });
});

// ---- Test 6: completeRevision when rejecting_stage="human" goes directly to human ----

describe("completeRevision() with rejecting_stage=human", () => {
  it("goes directly to human stage without re-running subjective", async () => {
    // Use a policy with both subjective and human stages
    const policy: PolicyConfig = {
      name: "full-pipeline",
      stages: ["objective", "subjective", "human"],
      max_revisions: 3,
      objective: {
        checks: [
          {
            name: "format_check",
            config: { allowed: ["text/*"] },
            severity: "blocking",
          },
        ],
        fail_threshold: 1,
      },
      subjective: {
        criteria: [
          { name: "quality", description: "Quality", weight: 1, scale: 10 },
        ],
        pass_threshold: 6.0,
      },
      human: { required: true },
    };

    const { id } = await setupReview({
      policy,
      policyName: "full-pipeline",
    });

    // Submit — will reach human (subjective skips without API key)
    await engine.submit(id);

    const statusAfterSubmit = await storage.readStatus(id);
    expect(statusAfterSubmit.stage).toBe("human");

    // Human requests revision
    await engine.decide(id, { decision: "revision_requested" });
    const statusAfterDecide = await storage.readStatus(id);
    expect(statusAfterDecide.rejecting_stage).toBe("human");

    // Clear SSE events before completeRevision
    sseEvents.length = 0;

    // Complete revision — should go DIRECTLY to human, not re-run subjective
    const result = await engine.completeRevision(id);
    expect(result.stage).toBe("human");

    const finalStatus = await storage.readStatus(id);
    expect(finalStatus.stage).toBe("human");

    // Should emit deliverable:revised SSE
    const revisedEvent = sseEvents.find((e) => e.event === "deliverable:revised");
    expect(revisedEvent).toBeDefined();
  });
});

// ---- Test 7: completeRevision when max revisions exceeded → auto-reject ----

describe("completeRevision() max revisions exceeded", () => {
  it("auto-rejects when revision_number already at max_revisions", async () => {
    const policy: PolicyConfig = {
      name: "low-revisions",
      stages: ["objective", "human"],
      max_revisions: 1,
      objective: {
        checks: [
          {
            name: "format_check",
            config: { allowed: ["text/*"] },
            severity: "blocking",
          },
        ],
        fail_threshold: 1,
      },
      human: { required: true },
    };

    const { id } = await setupReview({
      policy,
      policyName: "low-revisions",
    });

    // Submit → reaches human
    await engine.submit(id);

    // Human requests revision (revision 0 → now we'll be at 1 after completeRevision)
    await engine.decide(id, { decision: "revision_requested" });

    // Complete first revision — should succeed (revision_number becomes 1, max is 1)
    const result1 = await engine.completeRevision(id);
    expect(result1.stage).toBe("human");

    // Now at revision 1 = max, human requests revision again
    await engine.decide(id, { decision: "revision_requested" });

    // Complete revision again — now revision_number would exceed max_revisions
    const result2 = await engine.completeRevision(id);
    expect(result2.stage).toBe("rejected");

    const finalStatus = await storage.readStatus(id);
    expect(finalStatus.stage).toBe("rejected");
  });
});

// ---- Additional: completeRevision when rejecting_stage="objective" re-runs from objective ----

describe("completeRevision() with rejecting_stage=objective", () => {
  it("re-runs from objective stage after objective failure", async () => {
    // Policy that fails objective for .txt but the file we add will be text/*
    const imageOnlyPolicy: PolicyConfig = {
      name: "image-only-2",
      stages: ["objective"],
      max_revisions: 3,
      objective: {
        checks: [
          {
            name: "format_check",
            config: { allowed: ["image/*"] },
            severity: "blocking",
          },
        ],
        fail_threshold: 1,
      },
    };

    const { id } = await setupReview({
      policy: imageOnlyPolicy,
      policyName: "image-only-2",
      files: [{ name: "doc.txt", content: "text", contentType: "text/plain" }],
    });

    // Submit — objective fails
    const submitResult = await engine.submit(id);
    expect(submitResult.stage).toBe("revision_requested");

    const statusAfterSubmit = await storage.readStatus(id);
    expect(statusAfterSubmit.rejecting_stage).toBe("objective");

    // Complete revision (still a txt file, will fail again)
    const result = await engine.completeRevision(id);
    expect(result.stage).toBe("revision_requested");

    const finalStatus = await storage.readStatus(id);
    expect(finalStatus.stage).toBe("revision_requested");
    expect(finalStatus.rejecting_stage).toBe("objective");
    expect(finalStatus.revision_number).toBe(1);
  });
});

// ---- Additional: completeRevision throws when status is not revision_requested ----

describe("completeRevision() error handling", () => {
  it("throws when status is not revision_requested", async () => {
    const { id } = await setupReview();
    // Still in draft — do not submit

    await expect(engine.completeRevision(id)).rejects.toThrow();
  });
});
