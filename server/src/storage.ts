import * as fs from "fs";
import * as path from "path";
import mime from "mime-types";
import type {
  DeliverableMeta,
  DeliverableStatus,
  DeliverableFile,
  DeliverableSummary,
  Deliverable,
  ObjectiveCheck,
  SubjectiveCriterion,
  Feedback,
  PolicyConfig,
  Stage,
  RevisionEntry,
  ListReviewsFilter,
} from "@aros/types";

// ---- Config types ----

export interface ArosConfig {
  version: number;
  port: number;
  subjective_model: string;
}

const DEFAULT_CONFIG: ArosConfig = {
  version: 1,
  port: 4100,
  subjective_model: "claude-sonnet-4-20250514",
};

const DEFAULT_POLICY: PolicyConfig = {
  name: "default",
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
        config: { allowed: ["image/*", "text/*", "application/pdf"] },
        severity: "blocking",
      },
    ],
    fail_threshold: 1,
  },
  subjective: {
    criteria: [
      {
        name: "relevance",
        description: "How well does the deliverable match the brief?",
        weight: 3,
        scale: 10,
      },
      {
        name: "quality",
        description: "Overall production quality",
        weight: 2,
        scale: 10,
      },
      {
        name: "clarity",
        description: "Is the message clear and effective?",
        weight: 1,
        scale: 10,
      },
    ],
    pass_threshold: 6.0,
  },
  human: { required: true },
};

// ---- Storage class ----

export class Storage {
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  /** All AROS data lives under .aros/ in the project root */
  private get arosDir(): string {
    return path.join(this.projectDir, ".aros");
  }

  // ---- Helpers ----

  private reviewDir(id: string): string {
    return path.join(this.arosDir, "review", id);
  }

  private readJson<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  }

  private writeJson(filePath: string, data: unknown): void {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  private mkdirp(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  private copyDirRecursive(src: string, dest: string): void {
    this.mkdirp(dest);
    if (!fs.existsSync(src)) return;
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private todayString(): string {
    const now = new Date();
    const y = now.getFullYear().toString();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  }

  // ---- Initialization ----

  async init(): Promise<void> {
    this.mkdirp(this.arosDir);
    this.mkdirp(path.join(this.arosDir, "review"));
    this.mkdirp(path.join(this.arosDir, "approved"));
    this.mkdirp(path.join(this.arosDir, "rejected"));
    this.mkdirp(path.join(this.arosDir, "policies"));

    const configPath = path.join(this.arosDir, "config.json");
    if (!fs.existsSync(configPath)) {
      this.writeJson(configPath, DEFAULT_CONFIG);
    }

    const defaultPolicyPath = path.join(this.arosDir, "policies", "default.json");
    if (!fs.existsSync(defaultPolicyPath)) {
      this.writeJson(defaultPolicyPath, DEFAULT_POLICY);
    }

    this.ensureGitignore();
  }

  private ensureGitignore(): void {
    const entries = [".aros/", ".mcp.json"];
    const gitignorePath = path.join(this.projectDir, ".gitignore");

    let content = "";
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, "utf-8");
    }

    const lines = content.split("\n");
    const missing = entries.filter((e) => !lines.includes(e));
    if (missing.length === 0) return;

    const additions = missing.join("\n");
    const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    const header = content.length === 0 || content.trim().length === 0 ? "" : "\n# AROS\n";
    fs.writeFileSync(gitignorePath, content + separator + header + additions + "\n");
  }

  async isInitialized(): Promise<boolean> {
    return fs.existsSync(path.join(this.arosDir, "config.json"));
  }

  async getConfig(): Promise<ArosConfig> {
    const configPath = path.join(this.arosDir, "config.json");
    return this.readJson<ArosConfig>(configPath);
  }

  // ---- ID Generation ----

  async nextReviewId(): Promise<string> {
    const today = this.todayString();
    const prefix = `d-${today}-`;
    const reviewRoot = path.join(this.arosDir, "review");

    this.mkdirp(reviewRoot);

    let maxN = 0;
    const entries = fs.readdirSync(reviewRoot);
    for (const entry of entries) {
      if (entry.startsWith(prefix)) {
        const numStr = entry.slice(prefix.length);
        const n = parseInt(numStr, 10);
        if (!isNaN(n) && n > maxN) {
          maxN = n;
        }
      }
    }

    const next = maxN + 1;
    const id = `${prefix}${String(next).padStart(3, "0")}`;

    // Create the directory to reserve the ID
    this.mkdirp(path.join(reviewRoot, id));

    return id;
  }

  // ---- Review CRUD ----

  async createReview(meta: DeliverableMeta): Promise<string> {
    const id = await this.nextReviewId();
    const dir = this.reviewDir(id);
    this.mkdirp(dir);

    this.writeJson(path.join(dir, "meta.json"), meta);

    const now = new Date().toISOString();
    const status: DeliverableStatus = {
      stage: "draft",
      score: null,
      revision_number: 0,
      entered_stage_at: now,
      submitted_at: now,
      rejecting_stage: null,
    };
    this.writeJson(path.join(dir, "status.json"), status);

    return id;
  }

  async readMeta(id: string): Promise<DeliverableMeta> {
    return this.readJson<DeliverableMeta>(
      path.join(this.reviewDir(id), "meta.json")
    );
  }

  async readStatus(id: string): Promise<DeliverableStatus> {
    return this.readJson<DeliverableStatus>(
      path.join(this.reviewDir(id), "status.json")
    );
  }

  async updateStatus(
    id: string,
    updates: Partial<DeliverableStatus>
  ): Promise<DeliverableStatus> {
    const current = await this.readStatus(id);
    const updated: DeliverableStatus = { ...current, ...updates };
    this.writeJson(path.join(this.reviewDir(id), "status.json"), updated);
    return updated;
  }

  // ---- File management ----

  async addFile(
    id: string,
    filename: string,
    content: string,
    contentType: string,
    encoding: "utf-8" | "base64"
  ): Promise<void> {
    const contentDir = path.join(this.reviewDir(id), "content");
    this.mkdirp(contentDir);
    const filePath = path.join(contentDir, filename);

    if (encoding === "base64") {
      const buffer = Buffer.from(content, "base64");
      fs.writeFileSync(filePath, buffer);
    } else {
      fs.writeFileSync(filePath, content, "utf-8");
    }
  }

  async addFileFromPath(
    id: string,
    sourcePath: string,
    filename?: string
  ): Promise<{ filename: string; size_bytes: number }> {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }

    const resolvedFilename = filename ?? path.basename(sourcePath);
    const contentDir = path.join(this.reviewDir(id), "content");
    this.mkdirp(contentDir);
    const destPath = path.join(contentDir, resolvedFilename);

    fs.copyFileSync(sourcePath, destPath);
    const stat = fs.statSync(destPath);
    return { filename: resolvedFilename, size_bytes: stat.size };
  }

  async readFile(
    id: string,
    filename: string
  ): Promise<{ content: string; encoding: "utf-8" | "base64" }> {
    const filePath = await this.getFilePath(id, filename);
    if (!filePath) {
      throw new Error(`File not found: ${filename} in review ${id}`);
    }

    const buffer = fs.readFileSync(filePath);

    // Try to decode as utf-8 — if it succeeds cleanly, return as text
    try {
      const text = buffer.toString("utf-8");
      // Verify round-trip is clean (no replacement chars from invalid sequences)
      const reEncoded = Buffer.from(text, "utf-8");
      if (reEncoded.equals(buffer)) {
        return { content: text, encoding: "utf-8" };
      }
    } catch {
      // fall through to base64
    }

    return { content: buffer.toString("base64"), encoding: "base64" };
  }

  async getFilePath(id: string, filename: string): Promise<string | null> {
    const candidates = [
      path.join(this.arosDir, "review", id, "content", filename),
      path.join(this.arosDir, "approved", id, "content", filename),
      path.join(this.arosDir, "rejected", id, "content", filename),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }

  async listFiles(id: string): Promise<DeliverableFile[]> {
    // Check review, approved, rejected dirs for content
    const bases = [
      path.join(this.arosDir, "review", id, "content"),
      path.join(this.arosDir, "approved", id, "content"),
      path.join(this.arosDir, "rejected", id, "content"),
    ];

    let contentDir: string | null = null;
    for (const base of bases) {
      if (fs.existsSync(base)) {
        contentDir = base;
        break;
      }
    }

    if (!contentDir) {
      return [];
    }

    const entries = fs.readdirSync(contentDir, { withFileTypes: true });
    const files: DeliverableFile[] = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const stat = fs.statSync(path.join(contentDir, entry.name));
      files.push({
        filename: entry.name,
        content_type: mime.lookup(entry.name) || "application/octet-stream",
        size_bytes: stat.size,
        objective_results: null,
        subjective_results: null,
        score: null,
        status: null,
      });
    }

    return files;
  }

  // ---- Analysis results ----

  async writeObjectiveResults(
    id: string,
    results: ObjectiveCheck[]
  ): Promise<void> {
    this.writeJson(
      path.join(this.reviewDir(id), "objective_results.json"),
      results
    );
  }

  async readObjectiveResults(id: string): Promise<ObjectiveCheck[] | null> {
    const p = path.join(this.reviewDir(id), "objective_results.json");
    if (!fs.existsSync(p)) return null;
    return this.readJson<ObjectiveCheck[]>(p);
  }

  async writeSubjectiveResults(
    id: string,
    results: SubjectiveCriterion[]
  ): Promise<void> {
    this.writeJson(
      path.join(this.reviewDir(id), "subjective_results.json"),
      results
    );
  }

  async readSubjectiveResults(
    id: string
  ): Promise<SubjectiveCriterion[] | null> {
    const p = path.join(this.reviewDir(id), "subjective_results.json");
    if (!fs.existsSync(p)) return null;
    return this.readJson<SubjectiveCriterion[]>(p);
  }

  async writeFeedback(id: string, feedback: Feedback): Promise<void> {
    this.writeJson(path.join(this.reviewDir(id), "feedback.json"), feedback);
  }

  async readFeedback(id: string): Promise<Feedback | null> {
    const p = path.join(this.reviewDir(id), "feedback.json");
    if (!fs.existsSync(p)) return null;
    return this.readJson<Feedback>(p);
  }

  // ---- History ----

  async saveHistory(id: string, version: number): Promise<void> {
    const contentDir = path.join(this.reviewDir(id), "content");
    const histDir = path.join(this.reviewDir(id), "history", `v${version}`);
    this.copyDirRecursive(contentDir, histDir);
  }

  async saveFileToHistory(
    id: string,
    filename: string,
    version: number
  ): Promise<void> {
    const src = path.join(this.reviewDir(id), "content", filename);
    const histDir = path.join(this.reviewDir(id), "history", `v${version}`);
    this.mkdirp(histDir);
    fs.copyFileSync(src, path.join(histDir, filename));
  }

  // ---- Terminal buckets ----

  async moveToTerminal(id: string, bucket: "approved" | "rejected"): Promise<void> {
    const src = this.reviewDir(id);
    const dest = path.join(this.arosDir, bucket, id);
    this.copyDirRecursive(src, dest);
  }

  // ---- List reviews ----

  async listReviews(filter?: ListReviewsFilter): Promise<DeliverableSummary[]> {
    const reviewRoot = path.join(this.arosDir, "review");
    if (!fs.existsSync(reviewRoot)) return [];

    const entries = fs.readdirSync(reviewRoot, { withFileTypes: true });
    const results: DeliverableSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      const metaPath = path.join(reviewRoot, id, "meta.json");
      const statusPath = path.join(reviewRoot, id, "status.json");

      if (!fs.existsSync(metaPath) || !fs.existsSync(statusPath)) continue;

      try {
        const meta = this.readJson<DeliverableMeta>(metaPath);
        const status = this.readJson<DeliverableStatus>(statusPath);

        if (filter?.stage && status.stage !== filter.stage) continue;
        if (filter?.source_agent && meta.source_agent !== filter.source_agent) continue;

        // Count files
        const contentDir = path.join(reviewRoot, id, "content");
        let fileCount: number | null = null;
        if (fs.existsSync(contentDir)) {
          const files = fs.readdirSync(contentDir).filter((f) => {
            return fs.statSync(path.join(contentDir, f)).isFile();
          });
          fileCount = files.length;
        }

        results.push({
          id,
          title: meta.title,
          source_agent: meta.source_agent,
          policy: meta.policy,
          content_type: meta.content_type,
          stage: status.stage,
          score: status.score,
          entered_stage_at: status.entered_stage_at,
          submitted_at: status.submitted_at,
          revision_number: status.revision_number,
          is_folder: fileCount !== null && fileCount > 1,
          file_count: fileCount,
        });
      } catch {
        // Skip malformed entries
        continue;
      }
    }

    return results;
  }

  // ---- Full deliverable assembly ----

  async getFullDeliverable(
    id: string,
    apiBaseUrl?: string
  ): Promise<Deliverable> {
    const meta = await this.readMeta(id);
    const status = await this.readStatus(id);
    const objectiveResults = await this.readObjectiveResults(id);
    const subjectiveResults = await this.readSubjectiveResults(id);
    const feedback = await this.readFeedback(id);
    const files = await this.listFiles(id);

    // Attach preview URLs if base URL provided
    if (apiBaseUrl) {
      for (const f of files) {
        f.preview_url = `${apiBaseUrl}/api/deliverables/${id}/files/${encodeURIComponent(f.filename)}`;
      }
    }

    // Read history entries if present
    const historyDir = path.join(this.reviewDir(id), "history");
    const history: RevisionEntry[] = [];
    if (fs.existsSync(historyDir)) {
      const versions = fs.readdirSync(historyDir).sort();
      for (const ver of versions) {
        const vNum = parseInt(ver.slice(1), 10);
        history.push({
          version: vNum,
          summary: `Revision ${vNum}`,
          feedback: null,
          timestamp: "",
        });
      }
    }

    const summary: DeliverableSummary = {
      id,
      title: meta.title,
      source_agent: meta.source_agent,
      policy: meta.policy,
      content_type: meta.content_type,
      stage: status.stage,
      score: status.score,
      entered_stage_at: status.entered_stage_at,
      submitted_at: status.submitted_at,
      revision_number: status.revision_number,
      is_folder: files.length > 1,
      file_count: files.length,
    };

    return {
      ...summary,
      content: "",
      brief: meta.brief,
      objective_results: objectiveResults,
      subjective_results: subjectiveResults,
      feedback,
      history,
      files: files.length > 0 ? files : null,
      folder_strategy: meta.folder_strategy ?? null,
    };
  }

  // ---- Policies ----

  async listPolicies(): Promise<string[]> {
    const policiesDir = path.join(this.arosDir, "policies");
    if (!fs.existsSync(policiesDir)) return [];
    const entries = fs.readdirSync(policiesDir);
    return entries
      .filter((e) => e.endsWith(".json"))
      .map((e) => e.slice(0, -5));
  }

  async readPolicy(name: string): Promise<PolicyConfig> {
    const p = path.join(this.arosDir, "policies", `${name}.json`);
    return this.readJson<PolicyConfig>(p);
  }

  async writePolicy(name: string, policy: PolicyConfig): Promise<void> {
    const policiesDir = path.join(this.arosDir, "policies");
    this.mkdirp(policiesDir);
    this.writeJson(path.join(policiesDir, `${name}.json`), policy);
  }

  async deletePolicy(name: string): Promise<void> {
    const p = path.join(this.arosDir, "policies", `${name}.json`);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }
}
