import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Storage } from "../storage.js";

let tmpDir: string;
let storage: Storage;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-test-"));
  storage = new Storage(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---- init() ----

describe("init()", () => {
  it("creates required directories", async () => {
    await storage.init();
    expect(fs.existsSync(path.join(tmpDir, ".aros", "review"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".aros", "approved"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".aros", "rejected"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".aros", "policies"))).toBe(true);
  });

  it("writes .aros/config.json", async () => {
    await storage.init();
    const configPath = path.join(tmpDir, ".aros", "config.json");
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(config.version).toBe(1);
    expect(config.port).toBe(4100);
    expect(typeof config.subjective_model).toBe("string");
  });

  it("writes default.json policy", async () => {
    await storage.init();
    const policyPath = path.join(tmpDir, ".aros", "policies", "default.json");
    expect(fs.existsSync(policyPath)).toBe(true);
    const policy = JSON.parse(fs.readFileSync(policyPath, "utf-8"));
    expect(policy.name).toBe("default");
    expect(Array.isArray(policy.stages)).toBe(true);
    expect(typeof policy.max_revisions).toBe("number");
    expect(policy.objective).toBeDefined();
    expect(policy.subjective).toBeDefined();
    expect(policy.human).toBeDefined();
  });

  it("is idempotent — calling init() twice does not throw", async () => {
    await storage.init();
    await expect(storage.init()).resolves.not.toThrow();
  });
});

// ---- isInitialized() ----

describe("isInitialized()", () => {
  it("returns false before init()", async () => {
    expect(await storage.isInitialized()).toBe(false);
  });

  it("returns true after init()", async () => {
    await storage.init();
    expect(await storage.isInitialized()).toBe(true);
  });
});

// ---- getConfig() ----

describe("getConfig()", () => {
  it("returns config object after init", async () => {
    await storage.init();
    const config = await storage.getConfig();
    expect(config.version).toBe(1);
    expect(config.port).toBe(4100);
    expect(typeof config.subjective_model).toBe("string");
  });
});

// ---- nextReviewId() ----

describe("nextReviewId()", () => {
  it("generates ID with correct format d-{YYYYMMDD}-{NNN}", async () => {
    await storage.init();
    const id = await storage.nextReviewId();
    expect(id).toMatch(/^d-\d{8}-\d{3}$/);
  });

  it("first ID for the day is d-{TODAY}-001", async () => {
    await storage.init();
    const id = await storage.nextReviewId();
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");
    expect(id).toBe(`d-${dateStr}-001`);
  });

  it("second call returns 002", async () => {
    await storage.init();
    await storage.nextReviewId();
    const id2 = await storage.nextReviewId();
    expect(id2).toMatch(/-002$/);
  });

  it("third call returns 003", async () => {
    await storage.init();
    await storage.nextReviewId();
    await storage.nextReviewId();
    const id3 = await storage.nextReviewId();
    expect(id3).toMatch(/-003$/);
  });

  it("creates the review directory to reserve the ID", async () => {
    await storage.init();
    const id = await storage.nextReviewId();
    expect(fs.existsSync(path.join(tmpDir, ".aros", "review", id))).toBe(true);
  });
});

// ---- createReview() ----

describe("createReview()", () => {
  it("writes meta.json to the review directory", async () => {
    await storage.init();
    const meta = {
      title: "Test deliverable",
      brief: "A short brief",
      policy: "default",
      source_agent: "agent-1",
      content_type: "text/plain",
    };
    const id = await storage.createReview(meta);
    const metaPath = path.join(tmpDir, ".aros", "review", id, "meta.json");
    expect(fs.existsSync(metaPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    expect(written.title).toBe("Test deliverable");
    expect(written.source_agent).toBe("agent-1");
  });

  it("writes status.json with stage=draft", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    const statusPath = path.join(tmpDir, ".aros", "review", id, "status.json");
    expect(fs.existsSync(statusPath)).toBe(true);
    const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    expect(status.stage).toBe("draft");
    expect(status.revision_number).toBe(0);
    expect(typeof status.submitted_at).toBe("string");
  });

  it("returns a valid ID string", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});

// ---- addFile() / listFiles() / readFile() ----

describe("addFile() and listFiles() and readFile()", () => {
  it("writes a utf-8 text file to content/", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    await storage.addFile(id, "hello.txt", "Hello world", "text/plain", "utf-8");
    const filePath = path.join(tmpDir, ".aros", "review", id, "content", "hello.txt");
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("Hello world");
  });

  it("writes a base64-encoded binary file to content/", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "image/png",
    });
    const originalBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const b64 = originalBytes.toString("base64");
    await storage.addFile(id, "img.png", b64, "image/png", "base64");
    const filePath = path.join(tmpDir, ".aros", "review", id, "content", "img.png");
    expect(fs.existsSync(filePath)).toBe(true);
    const written = fs.readFileSync(filePath);
    expect(written).toEqual(originalBytes);
  });

  it("listFiles() returns correct DeliverableFile metadata", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    await storage.addFile(id, "a.txt", "content a", "text/plain", "utf-8");
    await storage.addFile(id, "b.txt", "content b", "text/plain", "utf-8");
    const files = await storage.listFiles(id);
    expect(files).toHaveLength(2);
    const names = files.map((f) => f.filename).sort();
    expect(names).toEqual(["a.txt", "b.txt"]);
    for (const f of files) {
      expect(typeof f.size_bytes).toBe("number");
      expect(f.size_bytes).toBeGreaterThan(0);
      expect(f.objective_results).toBeNull();
      expect(f.subjective_results).toBeNull();
      expect(f.score).toBeNull();
      expect(f.status).toBeNull();
    }
  });

  it("listFiles() returns empty array when content/ dir is missing", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    const files = await storage.listFiles(id);
    expect(files).toEqual([]);
  });

  it("readFile() returns utf-8 content for text files", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    await storage.addFile(id, "readme.txt", "hello", "text/plain", "utf-8");
    const { content, encoding } = await storage.readFile(id, "readme.txt");
    expect(encoding).toBe("utf-8");
    expect(content).toBe("hello");
  });
});

// ---- updateStatus() / readStatus() / readMeta() ----

describe("updateStatus() / readStatus() / readMeta()", () => {
  it("readMeta() returns written meta", async () => {
    await storage.init();
    const meta = {
      title: "My review",
      brief: "brief text",
      policy: "default",
      source_agent: "agent-xyz",
      content_type: "text/html",
    };
    const id = await storage.createReview(meta);
    const retrieved = await storage.readMeta(id);
    expect(retrieved.title).toBe("My review");
    expect(retrieved.source_agent).toBe("agent-xyz");
  });

  it("readStatus() returns status with stage=draft initially", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    const status = await storage.readStatus(id);
    expect(status.stage).toBe("draft");
  });

  it("updateStatus() writes the updated fields", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    await storage.updateStatus(id, { stage: "objective" });
    const status = await storage.readStatus(id);
    expect(status.stage).toBe("objective");
  });

  it("updateStatus() merges fields, not replaces", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    await storage.updateStatus(id, { stage: "subjective", score: 7.5 });
    const status = await storage.readStatus(id);
    expect(status.stage).toBe("subjective");
    expect(status.score).toBe(7.5);
    expect(typeof status.submitted_at).toBe("string");
  });
});

// ---- saveHistory() and saveFileToHistory() ----

describe("saveHistory()", () => {
  it("copies all content files to history/v{N}/", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    await storage.addFile(id, "file1.txt", "content1", "text/plain", "utf-8");
    await storage.addFile(id, "file2.txt", "content2", "text/plain", "utf-8");
    await storage.saveHistory(id, 1);
    expect(
      fs.existsSync(path.join(tmpDir, ".aros", "review", id, "history", "v1", "file1.txt"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpDir, ".aros", "review", id, "history", "v1", "file2.txt"))
    ).toBe(true);
  });

  it("handles multiple versions", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    await storage.addFile(id, "f.txt", "v1", "text/plain", "utf-8");
    await storage.saveHistory(id, 1);
    await storage.addFile(id, "f.txt", "v2", "text/plain", "utf-8");
    await storage.saveHistory(id, 2);
    const v1Content = fs.readFileSync(
      path.join(tmpDir, ".aros", "review", id, "history", "v1", "f.txt"),
      "utf-8"
    );
    const v2Content = fs.readFileSync(
      path.join(tmpDir, ".aros", "review", id, "history", "v2", "f.txt"),
      "utf-8"
    );
    expect(v1Content).toBe("v1");
    expect(v2Content).toBe("v2");
  });
});

describe("saveFileToHistory()", () => {
  it("copies a single file to history/v{N}/", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    await storage.addFile(id, "single.txt", "only me", "text/plain", "utf-8");
    await storage.saveFileToHistory(id, "single.txt", 1);
    expect(
      fs.existsSync(path.join(tmpDir, ".aros", "review", id, "history", "v1", "single.txt"))
    ).toBe(true);
    const written = fs.readFileSync(
      path.join(tmpDir, ".aros", "review", id, "history", "v1", "single.txt"),
      "utf-8"
    );
    expect(written).toBe("only me");
  });
});

// ---- moveToTerminal() ----

describe("moveToTerminal()", () => {
  it("copies review dir to approved/ when bucket is approved", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    await storage.addFile(id, "output.txt", "done", "text/plain", "utf-8");
    await storage.moveToTerminal(id, "approved");
    const approvedMeta = path.join(tmpDir, ".aros", "approved", id, "meta.json");
    expect(fs.existsSync(approvedMeta)).toBe(true);
    const approvedFile = path.join(tmpDir, ".aros", "approved", id, "content", "output.txt");
    expect(fs.existsSync(approvedFile)).toBe(true);
  });

  it("copies review dir to rejected/ when bucket is rejected", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    await storage.moveToTerminal(id, "rejected");
    expect(
      fs.existsSync(path.join(tmpDir, ".aros", "rejected", id, "meta.json"))
    ).toBe(true);
  });
});

// ---- listReviews() ----

describe("listReviews()", () => {
  it("returns all reviews when no filter provided", async () => {
    await storage.init();
    await storage.createReview({
      title: "A",
      brief: "B",
      policy: "default",
      source_agent: "agent-a",
      content_type: "text/plain",
    });
    await storage.createReview({
      title: "B",
      brief: "B",
      policy: "default",
      source_agent: "agent-b",
      content_type: "text/plain",
    });
    const reviews = await storage.listReviews();
    expect(reviews).toHaveLength(2);
  });

  it("filters by stage", async () => {
    await storage.init();
    const id1 = await storage.createReview({
      title: "A",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    const id2 = await storage.createReview({
      title: "B",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    await storage.updateStatus(id1, { stage: "objective" });
    const results = await storage.listReviews({ stage: "objective" });
    expect(results.map((r) => r.id)).toContain(id1);
    expect(results.map((r) => r.id)).not.toContain(id2);
  });

  it("filters by source_agent", async () => {
    await storage.init();
    const id1 = await storage.createReview({
      title: "A",
      brief: "B",
      policy: "default",
      source_agent: "agent-alpha",
      content_type: "text/plain",
    });
    await storage.createReview({
      title: "B",
      brief: "B",
      policy: "default",
      source_agent: "agent-beta",
      content_type: "text/plain",
    });
    const results = await storage.listReviews({ source_agent: "agent-alpha" });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(id1);
  });

  it("returns DeliverableSummary shaped objects", async () => {
    await storage.init();
    await storage.createReview({
      title: "My Title",
      brief: "brief",
      policy: "default",
      source_agent: "agent-x",
      content_type: "text/plain",
    });
    const reviews = await storage.listReviews();
    expect(reviews).toHaveLength(1);
    const r = reviews[0];
    expect(r.title).toBe("My Title");
    expect(r.source_agent).toBe("agent-x");
    expect(r.stage).toBe("draft");
    expect(typeof r.id).toBe("string");
    expect(typeof r.entered_stage_at).toBe("string");
    expect(typeof r.submitted_at).toBe("string");
  });
});

// ---- readPolicy() and listPolicies() ----

describe("readPolicy() and listPolicies()", () => {
  it("readPolicy() returns the default policy after init", async () => {
    await storage.init();
    const policy = await storage.readPolicy("default");
    expect(policy.name).toBe("default");
    expect(Array.isArray(policy.stages)).toBe(true);
    expect(policy.objective).toBeDefined();
    expect(policy.subjective).toBeDefined();
  });

  it("listPolicies() returns default policy name", async () => {
    await storage.init();
    const names = await storage.listPolicies();
    expect(names).toContain("default");
  });

  it("listPolicies() returns empty array when no policies", async () => {
    // No init, empty policies dir created manually
    fs.mkdirSync(path.join(tmpDir, ".aros", "policies"), { recursive: true });
    const names = await storage.listPolicies();
    expect(names).toEqual([]);
  });
});

// ---- writePolicy() / deletePolicy() ----

describe("writePolicy() and deletePolicy()", () => {
  it("writePolicy() creates a new policy file", async () => {
    await storage.init();
    const customPolicy = {
      name: "strict",
      stages: ["objective", "subjective", "human"] as const,
      max_revisions: 1,
      human: { required: true },
    };
    await storage.writePolicy("strict", customPolicy as any);
    const policyPath = path.join(tmpDir, ".aros", "policies", "strict.json");
    expect(fs.existsSync(policyPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(policyPath, "utf-8"));
    expect(written.name).toBe("strict");
    expect(written.max_revisions).toBe(1);
  });

  it("deletePolicy() removes the policy file", async () => {
    await storage.init();
    await storage.writePolicy("temp", { name: "temp" } as any);
    const policyPath = path.join(tmpDir, ".aros", "policies", "temp.json");
    expect(fs.existsSync(policyPath)).toBe(true);
    await storage.deletePolicy("temp");
    expect(fs.existsSync(policyPath)).toBe(false);
  });
});

// ---- writeObjectiveResults / readObjectiveResults ----

describe("writeObjectiveResults() / readObjectiveResults()", () => {
  it("round-trips objective results", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    const results = [
      { name: "file_size", passed: true, severity: "blocking" as const, details: "ok" },
    ];
    await storage.writeObjectiveResults(id, results);
    const read = await storage.readObjectiveResults(id);
    expect(read).toEqual(results);
  });
});

// ---- writeSubjectiveResults / readSubjectiveResults ----

describe("writeSubjectiveResults() / readSubjectiveResults()", () => {
  it("round-trips subjective results", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    const results = [
      {
        name: "relevance",
        score: 8,
        weight: 3,
        scale: 10,
        rationale: "Good match",
      },
    ];
    await storage.writeSubjectiveResults(id, results);
    const read = await storage.readSubjectiveResults(id);
    expect(read).toEqual(results);
  });
});

// ---- writeFeedback / readFeedback ----

describe("writeFeedback() / readFeedback()", () => {
  it("round-trips feedback", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    const feedback = {
      stage: "objective",
      decision: "revision_requested" as const,
      summary: "Needs work",
      issues: [],
      reviewer: "system",
      timestamp: new Date().toISOString(),
    };
    await storage.writeFeedback(id, feedback);
    const read = await storage.readFeedback(id);
    expect(read).toEqual(feedback);
  });
});

// ---- getFullDeliverable() ----

describe("getFullDeliverable()", () => {
  it("assembles a full Deliverable object", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "Full Test",
      brief: "A brief",
      policy: "default",
      source_agent: "agent-full",
      content_type: "text/plain",
    });
    await storage.addFile(id, "doc.txt", "content", "text/plain", "utf-8");
    const deliverable = await storage.getFullDeliverable(id);
    expect(deliverable.id).toBe(id);
    expect(deliverable.title).toBe("Full Test");
    expect(deliverable.source_agent).toBe("agent-full");
    expect(deliverable.stage).toBe("draft");
    expect(deliverable.brief).toBe("A brief");
    expect(Array.isArray(deliverable.files)).toBe(true);
    expect(deliverable.files).toHaveLength(1);
  });

  it("includes preview_url when apiBaseUrl is given", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    await storage.addFile(id, "file.txt", "data", "text/plain", "utf-8");
    const deliverable = await storage.getFullDeliverable(id, "http://localhost:4100");
    expect(deliverable.files![0].preview_url).toContain("http://localhost:4100");
    expect(deliverable.files![0].preview_url).toContain("file.txt");
  });
});

// ---- getFilePath() ----

describe("getFilePath()", () => {
  it("finds files in review/ dir", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    await storage.addFile(id, "x.txt", "x", "text/plain", "utf-8");
    const p = await storage.getFilePath(id, "x.txt");
    expect(p).not.toBeNull();
    expect(p).toContain("review");
    expect(p).toContain("x.txt");
  });

  it("finds files in approved/ dir", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    await storage.addFile(id, "y.txt", "y", "text/plain", "utf-8");
    await storage.moveToTerminal(id, "approved");
    // Remove from review to force approved path
    fs.rmSync(path.join(tmpDir, ".aros", "review", id, "content", "y.txt"));
    const p = await storage.getFilePath(id, "y.txt");
    expect(p).not.toBeNull();
    expect(p).toContain("approved");
  });

  it("returns null for non-existent file", async () => {
    await storage.init();
    const id = await storage.createReview({
      title: "T",
      brief: "B",
      policy: "default",
      source_agent: "a",
      content_type: "text/plain",
    });
    const p = await storage.getFilePath(id, "nope.txt");
    expect(p).toBeNull();
  });
});

// ---- init creates .aros directory ----

describe("init creates .aros directory", () => {
  it("creates registry.json with default official source", async () => {
    await storage.init();
    const registryPath = path.join(tmpDir, ".aros", "registry.json");
    expect(fs.existsSync(registryPath)).toBe(true);
    const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
    expect(registry.sources).toHaveLength(1);
    expect(registry.sources[0].name).toBe("official");
  });

  it("creates empty lock.json", async () => {
    await storage.init();
    const lockPath = path.join(tmpDir, ".aros", "lock.json");
    expect(fs.existsSync(lockPath)).toBe(true);
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(lock.version).toBe(1);
    expect(lock.locked).toEqual({});
  });

  it("creates modules subdirectories", async () => {
    await storage.init();
    expect(fs.existsSync(path.join(tmpDir, ".aros", "modules", "checks"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".aros", "modules", "criteria"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".aros", "modules", "policies"))).toBe(true);
  });
});

// ---- projectDir is accessible ----

describe("projectDir is accessible", () => {
  it("exposes projectDir as public readonly", () => {
    expect(storage.projectDir).toBe(tmpDir);
  });
});
