// ../mcp/dist/index.js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// ../server/dist/storage.js
import * as fs from "fs";
import * as path from "path";
import mime from "mime-types";
var DEFAULT_CONFIG = {
  version: 1,
  port: 4100,
  subjective_model: "claude-sonnet-4-20250514"
};
var DEFAULT_POLICY = {
  name: "default",
  stages: ["objective", "subjective", "human"],
  max_revisions: 3,
  objective: {
    checks: [
      {
        name: "file_size",
        config: { max_mb: 10 },
        severity: "blocking"
      },
      {
        name: "format_check",
        config: { allowed: ["image/*", "text/*", "application/pdf"] },
        severity: "blocking"
      }
    ],
    fail_threshold: 1
  },
  subjective: {
    criteria: [
      {
        name: "relevance",
        description: "How well does the deliverable match the brief?",
        weight: 3,
        scale: 10
      },
      {
        name: "quality",
        description: "Overall production quality",
        weight: 2,
        scale: 10
      },
      {
        name: "clarity",
        description: "Is the message clear and effective?",
        weight: 1,
        scale: 10
      }
    ],
    pass_threshold: 6
  },
  human: { required: true }
};
var Storage = class {
  projectDir;
  constructor(projectDir2) {
    this.projectDir = projectDir2;
  }
  /** All AROS data lives under .aros/ in the project root */
  get arosDir() {
    return path.join(this.projectDir, ".aros");
  }
  // ---- Helpers ----
  reviewDir(id) {
    return path.join(this.arosDir, "review", id);
  }
  readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  }
  mkdirp(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  copyDirRecursive(src, dest) {
    this.mkdirp(dest);
    if (!fs.existsSync(src))
      return;
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
  todayString() {
    const now = /* @__PURE__ */ new Date();
    const y = now.getFullYear().toString();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  }
  // ---- Initialization ----
  async init() {
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
  ensureGitignore() {
    const entries = [".aros/", ".mcp.json"];
    const gitignorePath = path.join(this.projectDir, ".gitignore");
    let content = "";
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, "utf-8");
    }
    const lines = content.split("\n");
    const missing = entries.filter((e) => !lines.includes(e));
    if (missing.length === 0)
      return;
    const additions = missing.join("\n");
    const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    const header = content.length === 0 || content.trim().length === 0 ? "" : "\n# AROS\n";
    fs.writeFileSync(gitignorePath, content + separator + header + additions + "\n");
  }
  async isInitialized() {
    return fs.existsSync(path.join(this.arosDir, "config.json"));
  }
  async getConfig() {
    const configPath = path.join(this.arosDir, "config.json");
    return this.readJson(configPath);
  }
  // ---- ID Generation ----
  async nextReviewId() {
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
    this.mkdirp(path.join(reviewRoot, id));
    return id;
  }
  // ---- Review CRUD ----
  async createReview(meta) {
    const id = await this.nextReviewId();
    const dir = this.reviewDir(id);
    this.mkdirp(dir);
    this.writeJson(path.join(dir, "meta.json"), meta);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const status = {
      stage: "draft",
      score: null,
      revision_number: 0,
      entered_stage_at: now,
      submitted_at: now,
      rejecting_stage: null
    };
    this.writeJson(path.join(dir, "status.json"), status);
    return id;
  }
  async readMeta(id) {
    return this.readJson(path.join(this.reviewDir(id), "meta.json"));
  }
  async readStatus(id) {
    return this.readJson(path.join(this.reviewDir(id), "status.json"));
  }
  async updateStatus(id, updates) {
    const current = await this.readStatus(id);
    const updated = { ...current, ...updates };
    this.writeJson(path.join(this.reviewDir(id), "status.json"), updated);
    return updated;
  }
  // ---- File management ----
  async addFile(id, filename, content, contentType, encoding) {
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
  async addFileFromPath(id, sourcePath, filename) {
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
  async readFile(id, filename) {
    const filePath = await this.getFilePath(id, filename);
    if (!filePath) {
      throw new Error(`File not found: ${filename} in review ${id}`);
    }
    const buffer = fs.readFileSync(filePath);
    try {
      const text = buffer.toString("utf-8");
      const reEncoded = Buffer.from(text, "utf-8");
      if (reEncoded.equals(buffer)) {
        return { content: text, encoding: "utf-8" };
      }
    } catch {
    }
    return { content: buffer.toString("base64"), encoding: "base64" };
  }
  async getFilePath(id, filename) {
    const candidates = [
      path.join(this.arosDir, "review", id, "content", filename),
      path.join(this.arosDir, "approved", id, "content", filename),
      path.join(this.arosDir, "rejected", id, "content", filename)
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }
  async listFiles(id) {
    const bases = [
      path.join(this.arosDir, "review", id, "content"),
      path.join(this.arosDir, "approved", id, "content"),
      path.join(this.arosDir, "rejected", id, "content")
    ];
    let contentDir = null;
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
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile())
        continue;
      const stat = fs.statSync(path.join(contentDir, entry.name));
      files.push({
        filename: entry.name,
        content_type: mime.lookup(entry.name) || "application/octet-stream",
        size_bytes: stat.size,
        objective_results: null,
        subjective_results: null,
        score: null,
        status: null
      });
    }
    return files;
  }
  // ---- Analysis results ----
  async writeObjectiveResults(id, results) {
    this.writeJson(path.join(this.reviewDir(id), "objective_results.json"), results);
  }
  async readObjectiveResults(id) {
    const p = path.join(this.reviewDir(id), "objective_results.json");
    if (!fs.existsSync(p))
      return null;
    return this.readJson(p);
  }
  async writeSubjectiveResults(id, results) {
    this.writeJson(path.join(this.reviewDir(id), "subjective_results.json"), results);
  }
  async readSubjectiveResults(id) {
    const p = path.join(this.reviewDir(id), "subjective_results.json");
    if (!fs.existsSync(p))
      return null;
    return this.readJson(p);
  }
  async writeFeedback(id, feedback) {
    this.writeJson(path.join(this.reviewDir(id), "feedback.json"), feedback);
  }
  async readFeedback(id) {
    const p = path.join(this.reviewDir(id), "feedback.json");
    if (!fs.existsSync(p))
      return null;
    return this.readJson(p);
  }
  // ---- History ----
  async saveHistory(id, version) {
    const contentDir = path.join(this.reviewDir(id), "content");
    const histDir = path.join(this.reviewDir(id), "history", `v${version}`);
    this.copyDirRecursive(contentDir, histDir);
  }
  async saveFileToHistory(id, filename, version) {
    const src = path.join(this.reviewDir(id), "content", filename);
    const histDir = path.join(this.reviewDir(id), "history", `v${version}`);
    this.mkdirp(histDir);
    fs.copyFileSync(src, path.join(histDir, filename));
  }
  // ---- Terminal buckets ----
  async moveToTerminal(id, bucket) {
    const src = this.reviewDir(id);
    const dest = path.join(this.arosDir, bucket, id);
    this.copyDirRecursive(src, dest);
  }
  // ---- List reviews ----
  async listReviews(filter) {
    const reviewRoot = path.join(this.arosDir, "review");
    if (!fs.existsSync(reviewRoot))
      return [];
    const entries = fs.readdirSync(reviewRoot, { withFileTypes: true });
    const results = [];
    for (const entry of entries) {
      if (!entry.isDirectory())
        continue;
      const id = entry.name;
      const metaPath = path.join(reviewRoot, id, "meta.json");
      const statusPath = path.join(reviewRoot, id, "status.json");
      if (!fs.existsSync(metaPath) || !fs.existsSync(statusPath))
        continue;
      try {
        const meta = this.readJson(metaPath);
        const status = this.readJson(statusPath);
        if (filter?.stage && status.stage !== filter.stage)
          continue;
        if (filter?.source_agent && meta.source_agent !== filter.source_agent)
          continue;
        const contentDir = path.join(reviewRoot, id, "content");
        let fileCount = null;
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
          file_count: fileCount
        });
      } catch {
        continue;
      }
    }
    return results;
  }
  // ---- Full deliverable assembly ----
  async getFullDeliverable(id, apiBaseUrl) {
    const meta = await this.readMeta(id);
    const status = await this.readStatus(id);
    const objectiveResults = await this.readObjectiveResults(id);
    const subjectiveResults = await this.readSubjectiveResults(id);
    const feedback = await this.readFeedback(id);
    const files = await this.listFiles(id);
    if (apiBaseUrl) {
      for (const f of files) {
        f.preview_url = `${apiBaseUrl}/api/deliverables/${id}/files/${encodeURIComponent(f.filename)}`;
      }
    }
    const historyDir = path.join(this.reviewDir(id), "history");
    const history = [];
    if (fs.existsSync(historyDir)) {
      const versions = fs.readdirSync(historyDir).sort();
      for (const ver of versions) {
        const vNum = parseInt(ver.slice(1), 10);
        history.push({
          version: vNum,
          summary: `Revision ${vNum}`,
          feedback: null,
          timestamp: ""
        });
      }
    }
    const summary = {
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
      file_count: files.length
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
      folder_strategy: meta.folder_strategy ?? null
    };
  }
  // ---- Policies ----
  async listPolicies() {
    const policiesDir = path.join(this.arosDir, "policies");
    if (!fs.existsSync(policiesDir))
      return [];
    const entries = fs.readdirSync(policiesDir);
    return entries.filter((e) => e.endsWith(".json")).map((e) => e.slice(0, -5));
  }
  async readPolicy(name) {
    const p = path.join(this.arosDir, "policies", `${name}.json`);
    return this.readJson(p);
  }
  async writePolicy(name, policy) {
    const policiesDir = path.join(this.arosDir, "policies");
    this.mkdirp(policiesDir);
    this.writeJson(path.join(policiesDir, `${name}.json`), policy);
  }
  async deletePolicy(name) {
    const p = path.join(this.arosDir, "policies", `${name}.json`);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  }
};

// ../server/dist/pipeline/engine.js
import * as path2 from "path";

// ../server/dist/pipeline/objective.js
var DEFAULT_PROFANITY_WORDS = [
  "damn",
  "hell",
  "ass",
  "crap",
  "bastard",
  "bitch",
  "shit",
  "fuck",
  "piss",
  "dick",
  "cock",
  "pussy",
  "whore",
  "slut",
  "cunt",
  "nigger",
  "faggot"
];
function runFileSizeCheck(file, check) {
  const maxMb = typeof check.config.max_mb === "number" ? check.config.max_mb : 10;
  const maxBytes = maxMb * 1024 * 1024;
  const passed = file.sizeBytes <= maxBytes;
  const details = passed ? `File size ${file.sizeBytes} bytes is within the ${maxMb} MB limit.` : `File size ${file.sizeBytes} bytes exceeds the ${maxMb} MB limit (${maxBytes} bytes).`;
  return {
    name: check.name,
    passed,
    severity: check.severity,
    details
  };
}
function runFormatCheck(file, check) {
  const allowed = Array.isArray(check.config.allowed) ? check.config.allowed : [];
  const passed = allowed.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1);
      return file.contentType.startsWith(prefix);
    }
    return file.contentType === pattern;
  });
  const details = passed ? `Content type "${file.contentType}" is allowed.` : `Content type "${file.contentType}" is not in the allowed list: ${allowed.join(", ")}.`;
  return {
    name: check.name,
    passed,
    severity: check.severity,
    details
  };
}
function runWordCountCheck(file, check) {
  const isText = file.contentType.startsWith("text/");
  if (!isText) {
    return {
      name: check.name,
      passed: true,
      severity: check.severity,
      details: `Skipped \u2014 word_count only applies to text/* files, got "${file.contentType}".`
    };
  }
  const words = file.content.trim() === "" ? [] : file.content.trim().split(/\s+/);
  const wordCount = words.length;
  const min = typeof check.config.min === "number" ? check.config.min : void 0;
  const max = typeof check.config.max === "number" ? check.config.max : void 0;
  let passed = true;
  const violations = [];
  if (min !== void 0 && wordCount < min) {
    passed = false;
    violations.push(`word count ${wordCount} is below minimum ${min}`);
  }
  if (max !== void 0 && wordCount > max) {
    passed = false;
    violations.push(`word count ${wordCount} exceeds maximum ${max}`);
  }
  const details = passed ? `Word count ${wordCount} is within bounds.` : `Word count check failed: ${violations.join("; ")}.`;
  return {
    name: check.name,
    passed,
    severity: check.severity,
    details
  };
}
function runImageDimensionsCheck(file, check) {
  const isSvg = file.contentType === "image/svg+xml" || file.filename.toLowerCase().endsWith(".svg");
  if (!isSvg) {
    return {
      name: check.name,
      passed: true,
      severity: check.severity,
      details: `Skipped \u2014 image_dimensions only supports SVG viewBox parsing for non-raster files. Content type: "${file.contentType}".`
    };
  }
  const viewBoxMatch = file.content.match(/viewBox=["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/);
  if (!viewBoxMatch) {
    return {
      name: check.name,
      passed: true,
      severity: check.severity,
      details: `Skipped \u2014 no detectable viewBox attribute found in SVG content.`
    };
  }
  const width = parseFloat(viewBoxMatch[1]);
  const height = parseFloat(viewBoxMatch[2]);
  const minWidth = typeof check.config.min_width === "number" ? check.config.min_width : void 0;
  const maxWidth = typeof check.config.max_width === "number" ? check.config.max_width : void 0;
  const minHeight = typeof check.config.min_height === "number" ? check.config.min_height : void 0;
  const maxHeight = typeof check.config.max_height === "number" ? check.config.max_height : void 0;
  const violations = [];
  if (minWidth !== void 0 && width < minWidth) {
    violations.push(`width ${width} is below minimum ${minWidth}`);
  }
  if (maxWidth !== void 0 && width > maxWidth) {
    violations.push(`width ${width} exceeds maximum ${maxWidth}`);
  }
  if (minHeight !== void 0 && height < minHeight) {
    violations.push(`height ${height} is below minimum ${minHeight}`);
  }
  if (maxHeight !== void 0 && height > maxHeight) {
    violations.push(`height ${height} exceeds maximum ${maxHeight}`);
  }
  const passed = violations.length === 0;
  const details = passed ? `SVG dimensions ${width}x${height} are within bounds.` : `Image dimension check failed: ${violations.join("; ")}.`;
  return {
    name: check.name,
    passed,
    severity: check.severity,
    details
  };
}
function runProfanityCheck(file, check) {
  const isText = file.contentType.startsWith("text/");
  if (!isText) {
    return {
      name: check.name,
      passed: true,
      severity: check.severity,
      details: `Skipped \u2014 profanity_check only applies to text/* files, got "${file.contentType}".`
    };
  }
  const wordList = Array.isArray(check.config.words) && check.config.words.length > 0 ? check.config.words : DEFAULT_PROFANITY_WORDS;
  const lowerContent = file.content.toLowerCase();
  const found = [];
  for (const word of wordList) {
    if (lowerContent.includes(word.toLowerCase())) {
      found.push(word);
    }
  }
  const passed = found.length === 0;
  const details = passed ? `No prohibited words detected.` : `Profanity check failed \u2014 found prohibited word(s): ${found.join(", ")}.`;
  return {
    name: check.name,
    passed,
    severity: check.severity,
    details
  };
}
function runSingleCheck(file, check) {
  switch (check.name) {
    case "file_size":
      return runFileSizeCheck(file, check);
    case "format_check":
      return runFormatCheck(file, check);
    case "word_count":
      return runWordCountCheck(file, check);
    case "image_dimensions":
      return runImageDimensionsCheck(file, check);
    case "profanity_check":
      return runProfanityCheck(file, check);
    default:
      return {
        name: check.name,
        passed: true,
        severity: check.severity,
        details: `Unknown check "${check.name}" \u2014 skipped.`
      };
  }
}
async function runObjectiveChecks(files, checks) {
  const results = [];
  for (const file of files) {
    for (const check of checks) {
      results.push(runSingleCheck(file, check));
    }
  }
  return results;
}

// ../server/dist/pipeline/subjective.js
function buildSubjectivePrompt(brief, contentBlocks, criteria) {
  const criteriaDescriptions = criteria.map((c) => `- ${c.name} (weight: ${c.weight}, scale: 0-${c.scale}): ${c.description}`).join("\n");
  const criteriaNames = criteria.map((c) => c.name).join('", "');
  const system = `You are a quality reviewer evaluating creative and marketing deliverables.
Your task is to score the provided deliverable against specific quality criteria.
You must respond with a valid JSON object \u2014 no additional text, no markdown, no explanation outside JSON.

The JSON must have the following shape:
{
  "scores": [
    { "name": "<criterion_name>", "score": <number>, "rationale": "<brief explanation>" },
    ...
  ]
}

Score each criterion on its defined scale. Be objective and concise in your rationale.`;
  const criteriaBlock = `## Evaluation Criteria

${criteriaDescriptions}

Score each of the following criteria: "${criteriaNames}"`;
  const briefBlock = `## Brief

${brief}`;
  const userContentBlocks = [
    {
      type: "text",
      text: `${briefBlock}

${criteriaBlock}

## Deliverable`
    }
  ];
  for (const block of contentBlocks) {
    if (block.type === "text") {
      userContentBlocks.push({
        type: "text",
        text: block.content
      });
    } else if (block.type === "image") {
      userContentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: block.mediaType,
          data: block.content
        }
      });
    }
  }
  userContentBlocks.push({
    type: "text",
    text: "Please evaluate the deliverable above and return your scores as JSON."
  });
  return {
    system,
    messages: [
      {
        role: "user",
        content: userContentBlocks
      }
    ]
  };
}
function parseSubjectiveResponse(raw, criteria) {
  let json = raw.trim();
  if (json.startsWith("```")) {
    json = json.replace(/^```[a-zA-Z]*\n?/, "");
    json = json.replace(/\n?```\s*$/, "");
    json = json.trim();
  }
  const parsed = JSON.parse(json);
  const scores = parsed.scores ?? [];
  const criteriaMap = new Map(criteria.map((c) => [c.name, c]));
  return scores.map((s) => {
    const criterion = criteriaMap.get(s.name);
    return {
      name: s.name,
      score: s.score,
      weight: criterion?.weight ?? 1,
      scale: criterion?.scale ?? 10,
      rationale: s.rationale
    };
  });
}
function computeWeightedScore(results) {
  if (results.length === 0)
    return 0;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const r of results) {
    weightedSum += r.score * r.weight;
    totalWeight += r.weight;
  }
  if (totalWeight === 0)
    return 0;
  return weightedSum / totalWeight;
}
async function runSubjectiveReview(brief, contentBlocks, criteria, model) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { skipped: true, reason: "ANTHROPIC_API_KEY not set" };
  }
  const Anthropic = await import("@anthropic-ai/sdk").then((m) => m.default ?? m);
  const client = new Anthropic({ apiKey });
  const prompt = buildSubjectivePrompt(brief, contentBlocks, criteria);
  let responseText;
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: prompt.system,
      messages: prompt.messages
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || !textBlock.text) {
      return { skipped: true, reason: "No text content in Anthropic response" };
    }
    responseText = textBlock.text;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { skipped: true, reason: `Anthropic API error: ${message}` };
  }
  let results;
  try {
    results = parseSubjectiveResponse(responseText, criteria);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { skipped: true, reason: `Failed to parse subjective response: ${message}` };
  }
  const score = computeWeightedScore(results);
  return { results, score };
}

// ../server/dist/notifications/driver.js
var drivers = /* @__PURE__ */ new Map();
function registerDriver(driver) {
  drivers.set(driver.name, driver);
}
function getDriver(name) {
  return drivers.get(name);
}

// ../server/dist/pipeline/engine.js
var PipelineEngine = class {
  storage;
  emitSSE;
  constructor(storage2, emitSSE) {
    this.storage = storage2;
    this.emitSSE = emitSSE;
  }
  // ---- Public API ----
  /**
   * Called by submit_for_review MCP tool.
   * Transitions deliverable from "draft" through the pipeline.
   */
  async submit(id) {
    const meta = await this.storage.readMeta(id);
    const status = await this.storage.readStatus(id);
    if (status.stage !== "draft") {
      throw new Error(`Cannot submit: deliverable ${id} is in stage "${status.stage}", expected "draft"`);
    }
    const policy = await this.storage.readPolicy(meta.policy);
    this.emit("deliverable:submitted", { id, title: meta.title });
    return this.advancePipeline(id, policy, 0);
  }
  /**
   * Called by dashboard decision endpoint.
   * Human reviewer approves, rejects, or requests revision.
   */
  async decide(id, payload) {
    const meta = await this.storage.readMeta(id);
    const status = await this.storage.readStatus(id);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (payload.decision === "approved") {
      if (payload.reason) {
        const feedback = {
          stage: "human",
          decision: "approved",
          summary: payload.reason,
          issues: [],
          reviewer: "human",
          timestamp: now
        };
        await this.storage.writeFeedback(id, feedback);
      }
      await this.storage.updateStatus(id, {
        stage: "approved",
        entered_stage_at: now,
        rejecting_stage: null
      });
      await this.storage.moveToTerminal(id, "approved");
      this.emit("deliverable:decided", {
        id,
        title: meta.title,
        decision: "approved"
      });
      await this.notify(id, "approved");
    } else if (payload.decision === "rejected") {
      if (payload.reason) {
        const feedback = {
          stage: "human",
          decision: "rejected",
          summary: payload.reason,
          issues: [],
          reviewer: "human",
          timestamp: now
        };
        await this.storage.writeFeedback(id, feedback);
      }
      await this.storage.updateStatus(id, {
        stage: "rejected",
        entered_stage_at: now,
        rejecting_stage: null
      });
      this.emit("deliverable:decided", {
        id,
        title: meta.title,
        decision: "rejected"
      });
      await this.notify(id, "rejected");
      await this.storage.moveToTerminal(id, "rejected");
    } else if (payload.decision === "revision_requested") {
      if (payload.reason) {
        const feedback = {
          stage: "human",
          decision: "revision_requested",
          summary: payload.reason,
          issues: [],
          reviewer: "human",
          timestamp: now
        };
        await this.storage.writeFeedback(id, feedback);
      }
      await this.storage.updateStatus(id, {
        stage: "revision_requested",
        entered_stage_at: now,
        rejecting_stage: "human"
      });
      this.emit("deliverable:decided", {
        id,
        title: meta.title,
        decision: "revision_requested"
      });
      await this.notify(id, "revision_requested");
    }
  }
  /**
   * Called by complete_revision MCP tool.
   * Re-enters the pipeline at the rejecting stage.
   */
  async completeRevision(id) {
    const status = await this.storage.readStatus(id);
    if (status.stage !== "revision_requested") {
      throw new Error(`Cannot complete revision for deliverable ${id}: current stage is "${status.stage}", expected "revision_requested"`);
    }
    const meta = await this.storage.readMeta(id);
    const policy = await this.storage.readPolicy(meta.policy);
    const newRevisionNumber = status.revision_number + 1;
    if (newRevisionNumber > policy.max_revisions) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      await this.storage.updateStatus(id, {
        stage: "rejected",
        entered_stage_at: now,
        rejecting_stage: null
      });
      this.emit("deliverable:decided", {
        id,
        title: meta.title,
        decision: "rejected",
        reason: "max_revisions_exceeded"
      });
      await this.storage.moveToTerminal(id, "rejected");
      return {
        stage: "rejected",
        message: `Auto-rejected: max revisions (${policy.max_revisions}) exceeded`
      };
    }
    await this.storage.updateStatus(id, {
      revision_number: newRevisionNumber,
      entered_stage_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    await this.storage.saveHistory(id, newRevisionNumber);
    this.emit("deliverable:revised", {
      id,
      title: meta.title,
      revision_number: newRevisionNumber
    });
    const rejectingStage = status.rejecting_stage;
    if (rejectingStage === "human") {
      const humanStageIndex = policy.stages.indexOf("human");
      if (humanStageIndex === -1) {
        return this.advancePipeline(id, policy, 0);
      }
      return this.advancePipeline(id, policy, humanStageIndex);
    } else if (rejectingStage === "subjective") {
      const subjectiveIndex = policy.stages.indexOf("subjective");
      if (subjectiveIndex === -1) {
        return this.advancePipeline(id, policy, 0);
      }
      return this.advancePipeline(id, policy, subjectiveIndex);
    } else {
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
  async advancePipeline(id, policy, startIndex) {
    for (let i = startIndex; i < policy.stages.length; i++) {
      const stage = policy.stages[i];
      const result = await this.processStage(id, policy, stage);
      if (result !== null) {
        return result;
      }
    }
    const meta = await this.storage.readMeta(id);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.storage.updateStatus(id, {
      stage: "approved",
      entered_stage_at: now,
      rejecting_stage: null
    });
    await this.storage.moveToTerminal(id, "approved");
    this.emit("deliverable:decided", {
      id,
      title: meta.title,
      decision: "approved",
      automated: true
    });
    return { stage: "approved", message: "Auto-approved: all stages passed" };
  }
  /**
   * Processes a single stage.
   * Returns null if the stage passed (pipeline should continue).
   * Returns { stage, message } if the pipeline should halt (human, revision_requested, approved).
   */
  async processStage(id, policy, stage) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await this.storage.updateStatus(id, {
      stage,
      entered_stage_at: now
    });
    this.emit("deliverable:stage_changed", { id, stage });
    if (stage === "objective") {
      return this.runObjectiveStage(id, policy, now);
    } else if (stage === "subjective") {
      return this.runSubjectiveStage(id, policy, now);
    } else if (stage === "human") {
      return this.runHumanStage(id, now);
    }
    return null;
  }
  async runObjectiveStage(id, policy, now) {
    const objectiveConfig = policy.objective;
    if (!objectiveConfig) {
      return null;
    }
    const files = await this.storage.listFiles(id);
    const fileInputs = await Promise.all(files.map(async (f) => {
      const { content } = await this.storage.readFile(id, f.filename);
      const contentType = detectContentType(f.filename);
      const sizeBytes = f.size_bytes;
      return {
        filename: f.filename,
        content,
        contentType,
        sizeBytes
      };
    }));
    const checks = objectiveConfig.checks;
    const results = await runObjectiveChecks(fileInputs, checks);
    await this.storage.writeObjectiveResults(id, results);
    const failThreshold = objectiveConfig.fail_threshold ?? 1;
    const blockingFailures = results.filter((r) => r.severity === "blocking" && !r.passed).length;
    if (blockingFailures >= failThreshold) {
      const meta = await this.storage.readMeta(id);
      const failedChecks = results.filter((r) => r.severity === "blocking" && !r.passed).map((r) => r.name).join(", ");
      const feedback = {
        stage: "objective",
        decision: "revision_requested",
        summary: `Objective checks failed: ${failedChecks}`,
        issues: results.filter((r) => !r.passed).map((r) => ({
          file: null,
          location: "file",
          category: r.name,
          severity: r.severity === "blocking" ? "critical" : "minor",
          description: r.details,
          suggestion: "Fix the reported issue and resubmit"
        })),
        reviewer: "system",
        timestamp: now
      };
      await this.storage.writeFeedback(id, feedback);
      await this.storage.updateStatus(id, {
        stage: "revision_requested",
        entered_stage_at: now,
        rejecting_stage: "objective"
      });
      this.emit("deliverable:stage_changed", {
        id,
        title: meta.title,
        stage: "revision_requested",
        reason: "objective_failed"
      });
      return {
        stage: "revision_requested",
        message: `Objective checks failed (${blockingFailures} blocking failure(s))`
      };
    }
    return null;
  }
  async runSubjectiveStage(id, policy, now) {
    const subjectiveConfig = policy.subjective;
    if (!subjectiveConfig) {
      return null;
    }
    const meta = await this.storage.readMeta(id);
    const config = await this.storage.getConfig();
    const files = await this.storage.listFiles(id);
    const contentBlocks = await Promise.all(files.map(async (f) => {
      const { content, encoding } = await this.storage.readFile(id, f.filename);
      const contentType = detectContentType(f.filename);
      if (encoding === "base64" && contentType.startsWith("image/")) {
        return {
          type: "image",
          content,
          mediaType: contentType
        };
      }
      return {
        type: "text",
        content
      };
    }));
    const result = await runSubjectiveReview(meta.brief, contentBlocks, subjectiveConfig.criteria, config.subjective_model);
    if ("skipped" in result) {
      return null;
    }
    await this.storage.writeSubjectiveResults(id, result.results);
    await this.storage.updateStatus(id, { score: result.score });
    const passThreshold = subjectiveConfig.pass_threshold;
    if (result.score < passThreshold) {
      const feedback = {
        stage: "subjective",
        decision: "revision_requested",
        summary: `Subjective score ${result.score.toFixed(2)} below threshold ${passThreshold}`,
        issues: [],
        reviewer: "system",
        timestamp: now
      };
      await this.storage.writeFeedback(id, feedback);
      await this.storage.updateStatus(id, {
        stage: "revision_requested",
        entered_stage_at: now,
        rejecting_stage: "subjective"
      });
      this.emit("deliverable:stage_changed", {
        id,
        title: meta.title,
        stage: "revision_requested",
        reason: "subjective_failed",
        score: result.score
      });
      return {
        stage: "revision_requested",
        message: `Subjective score ${result.score.toFixed(2)} below threshold ${passThreshold}`
      };
    }
    return null;
  }
  async runHumanStage(id, now) {
    const meta = await this.storage.readMeta(id);
    await this.storage.updateStatus(id, {
      stage: "human",
      entered_stage_at: now
    });
    this.emit("deliverable:stage_changed", {
      id,
      title: meta.title,
      stage: "human"
    });
    return {
      stage: "human",
      message: "Waiting for human review"
    };
  }
  // ---- Notification ----
  async notify(id, event) {
    const meta = await this.storage.readMeta(id);
    const notifConfig = meta.notification;
    if (!notifConfig)
      return;
    if (!notifConfig.events.includes(event))
      return;
    const driver = getDriver(notifConfig.driver);
    if (!driver)
      return;
    const status = await this.storage.readStatus(id);
    const feedback = await this.storage.readFeedback(id);
    try {
      await driver.send(event, {
        review_id: id,
        title: meta.title,
        revision_number: status.revision_number
      }, feedback, notifConfig.target);
    } catch {
    }
  }
  // ---- SSE helper ----
  emit(event, data) {
    if (this.emitSSE) {
      this.emitSSE(event, data);
    }
  }
};
function detectContentType(filename) {
  const ext = path2.extname(filename).toLowerCase();
  const map = {
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
    ".zip": "application/zip"
  };
  return map[ext] ?? "application/octet-stream";
}

// ../server/dist/notifications/paperclip.js
function buildCommentBody(event, deliverable, feedback) {
  const eventLabel = {
    approved: "Approved",
    revision_requested: "Revision Requested",
    rejected: "Rejected"
  };
  const lines = [
    `## AROS Review: ${eventLabel[event]}`,
    "",
    `**Deliverable:** ${deliverable.title}`,
    `**Review ID:** ${deliverable.review_id}`,
    `**Revision:** ${deliverable.revision_number}`,
    ""
  ];
  if (feedback) {
    lines.push(`**Summary:** ${feedback.summary}`, "");
    if (feedback.issues.length > 0) {
      lines.push("### Issues", "");
      for (const issue of feedback.issues) {
        const file = issue.file ? ` (${issue.file})` : "";
        lines.push(`- **[${issue.severity.toUpperCase()}]** ${issue.description}${file}`, `  - Location: ${issue.location}`, `  - Category: ${issue.category}`, `  - Suggestion: ${issue.suggestion}`, "");
      }
    }
  }
  return lines.join("\n");
}
var paperclipDriver = {
  name: "paperclip",
  validateTarget(target) {
    const required = ["api_url", "company_id", "issue_id"];
    for (const field of required) {
      if (!target[field]) {
        return { valid: false, error: `Missing required target field: ${field}` };
      }
    }
    return { valid: true };
  },
  async send(event, deliverable, feedback, target) {
    const api_url = target["api_url"];
    const company_id = target["company_id"];
    const issue_id = target["issue_id"];
    const commentsUrl = `${api_url}/api/companies/${company_id}/issues/${issue_id}/comments`;
    const issueUrl = `${api_url}/api/companies/${company_id}/issues/${issue_id}`;
    const body = buildCommentBody(event, deliverable, feedback);
    try {
      const commentRes = await fetch(commentsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: body })
      });
      if (!commentRes.ok) {
        return {
          success: false,
          error: `Paperclip comment POST failed: ${commentRes.status} ${commentRes.statusText}`
        };
      }
      if (event === "approved" || event === "rejected") {
        const newStatus = event === "approved" ? "done" : "blocked";
        const patchRes = await fetch(issueUrl, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus })
        });
        if (!patchRes.ok) {
          return {
            success: false,
            error: `Paperclip issue PATCH failed: ${patchRes.status} ${patchRes.statusText}`
          };
        }
      }
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Paperclip fetch error: ${message}` };
    }
  }
};

// ../mcp/dist/tools/create-review.js
import { z } from "zod";
function registerCreateReview(server, storage2, reviewUrl) {
  server.tool("create_review", "Create a new review draft. Returns a review_id for use with add_file and submit_for_review. Prefer submit_deliverable instead \u2014 it combines create, add files, and submit in one call.", {
    title: z.string().describe("Title of the deliverable"),
    brief: z.string().describe("Brief description or requirements for the deliverable"),
    policy: z.string().default("default").describe("Policy name to apply (defaults to 'default')"),
    source_agent: z.string().describe("Identifier for the agent submitting the deliverable"),
    content_type: z.string().describe("MIME type or description of the content (e.g. 'image/png', 'text/markdown')"),
    folder_strategy: z.enum(["all_pass", "select", "rank", "categorize"]).optional().describe("Folder review strategy when multiple files are submitted"),
    notification_driver: z.string().optional().describe("Notification driver name (e.g. 'paperclip')"),
    notification_target: z.record(z.unknown()).optional().describe("Notification target config object (driver-specific fields)"),
    notification_events: z.array(z.enum(["approved", "revision_requested", "rejected"])).optional().describe("Which events to trigger notifications for")
  }, async (args) => {
    try {
      if (args.notification_driver && args.notification_target) {
        const driver = getDriver(args.notification_driver);
        if (!driver) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: `Unknown notification driver: ${args.notification_driver}` })
              }
            ],
            isError: true
          };
        }
        const validation = driver.validateTarget(args.notification_target);
        if (!validation.valid) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: `Invalid notification target: ${validation.error}` })
              }
            ],
            isError: true
          };
        }
      }
      const meta = {
        title: args.title,
        brief: args.brief,
        policy: args.policy,
        source_agent: args.source_agent,
        content_type: args.content_type,
        ...args.folder_strategy ? { folder_strategy: args.folder_strategy } : {},
        ...args.notification_driver && args.notification_target ? {
          notification: {
            driver: args.notification_driver,
            target: args.notification_target,
            events: args.notification_events ?? ["approved", "revision_requested", "rejected"]
          }
        } : {}
      };
      const review_id = await storage2.createReview(meta);
      const url = await reviewUrl(review_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ review_id, review_url: url })
          }
        ]
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error }) }],
        isError: true
      };
    }
  });
}

// ../mcp/dist/tools/add-file.js
import { z as z2 } from "zod";
function registerAddFile(server, storage2) {
  server.tool("add_file", "Add a file to a review draft created by create_review. Prefer submit_deliverable instead \u2014 it handles file attachment automatically. Use this only when you need to add files incrementally.", {
    review_id: z2.string().describe("The review ID returned by create_review"),
    filename: z2.string().optional().describe("Name for the file in the review (e.g. 'report.md'). Required when using content, optional with source_path (defaults to the source filename)"),
    source_path: z2.string().optional().describe("Absolute path to a file on disk. AROS will copy it into the review. Preferred for large files, images, and binaries"),
    content: z2.string().optional().describe("Inline file content \u2014 UTF-8 text or base64-encoded binary. Use source_path instead for large files"),
    content_type: z2.string().optional().describe("MIME type (e.g. 'image/png', 'text/markdown'). Auto-detected from filename if omitted"),
    encoding: z2.enum(["utf-8", "base64"]).default("utf-8").describe("Encoding of the content field \u2014 'utf-8' for text, 'base64' for binary. Ignored when using source_path")
  }, async (args) => {
    try {
      if (args.source_path && args.content) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Provide either source_path or content, not both"
              })
            }
          ],
          isError: true
        };
      }
      if (!args.source_path && !args.content) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Provide either source_path (for files on disk) or content (for inline text)"
              })
            }
          ],
          isError: true
        };
      }
      if (args.source_path) {
        const result = await storage2.addFileFromPath(args.review_id, args.source_path, args.filename);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: true,
                filename: result.filename,
                size_bytes: result.size_bytes
              })
            }
          ]
        };
      }
      if (!args.filename) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "filename is required when using inline content"
              })
            }
          ],
          isError: true
        };
      }
      await storage2.addFile(args.review_id, args.filename, args.content, args.content_type ?? "application/octet-stream", args.encoding);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, filename: args.filename })
          }
        ]
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error }) }],
        isError: true
      };
    }
  });
}

// ../mcp/dist/tools/submit-for-review.js
import { z as z3 } from "zod";
function registerSubmitForReview(server, engine, reviewUrl) {
  server.tool("submit_for_review", "Submit a draft review for processing through the pipeline. Prefer submit_deliverable instead \u2014 it combines create, add files, and submit in one call. Use this only after manually calling create_review and add_file.", {
    review_id: z3.string().describe("The review ID to submit")
  }, async (args) => {
    try {
      const result = await engine.submit(args.review_id);
      const url = await reviewUrl(args.review_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              stage: result.stage,
              message: result.message,
              review_url: url
            })
          }
        ]
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error }) }],
        isError: true
      };
    }
  });
}

// ../mcp/dist/tools/check-status.js
import { z as z4 } from "zod";
function registerCheckStatus(server, storage2, reviewUrl) {
  server.tool("check_status", "Check the current status of a review, including its stage, score, and revision number.", {
    review_id: z4.string().describe("The review ID to check")
  }, async (args) => {
    try {
      const status = await storage2.readStatus(args.review_id);
      const feedback = await storage2.readFeedback(args.review_id);
      const url = await reviewUrl(args.review_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...status,
              ...feedback ? { feedback } : {},
              review_url: url
            })
          }
        ]
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error }) }],
        isError: true
      };
    }
  });
}

// ../mcp/dist/tools/get-feedback.js
import { z as z5 } from "zod";
function registerGetFeedback(server, storage2) {
  server.tool("get_feedback", "Retrieve feedback for a review. Returns the feedback object if available, or an error if no feedback exists yet.", {
    review_id: z5.string().describe("The review ID to get feedback for")
  }, async (args) => {
    try {
      const feedback = await storage2.readFeedback(args.review_id);
      if (!feedback) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: "No feedback available yet for this review" })
            }
          ],
          isError: true
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(feedback)
          }
        ]
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error }) }],
        isError: true
      };
    }
  });
}

// ../mcp/dist/tools/list-my-reviews.js
import { z as z6 } from "zod";
function registerListMyReviews(server, storage2) {
  server.tool("list_my_reviews", "List reviews, optionally filtered by source agent and/or stage.", {
    source_agent: z6.string().optional().describe("Filter by source agent identifier"),
    stage: z6.enum([
      "draft",
      "objective",
      "subjective",
      "human",
      "approved",
      "rejected",
      "revision_requested"
    ]).optional().describe("Filter by stage")
  }, async (args) => {
    try {
      const reviews = await storage2.listReviews({
        source_agent: args.source_agent,
        stage: args.stage
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ reviews })
          }
        ]
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error }) }],
        isError: true
      };
    }
  });
}

// ../mcp/dist/tools/read-file.js
import { z as z7 } from "zod";
function registerReadFile(server, storage2) {
  server.tool("read_file", "Read the contents of a file from a review. Returns the content along with its encoding and content type.", {
    review_id: z7.string().describe("The review ID that contains the file"),
    filename: z7.string().describe("The name of the file to read")
  }, async (args) => {
    try {
      const { content, encoding } = await storage2.readFile(args.review_id, args.filename);
      const ext = args.filename.split(".").pop()?.toLowerCase() ?? "";
      const contentTypeMap = {
        txt: "text/plain",
        md: "text/markdown",
        html: "text/html",
        htm: "text/html",
        css: "text/css",
        js: "text/javascript",
        ts: "text/typescript",
        json: "application/json",
        xml: "application/xml",
        pdf: "application/pdf",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        svg: "image/svg+xml",
        webp: "image/webp"
      };
      const content_type = contentTypeMap[ext] ?? "application/octet-stream";
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ content, content_type, encoding })
          }
        ]
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error }) }],
        isError: true
      };
    }
  });
}

// ../mcp/dist/tools/submit-revision.js
import { z as z8 } from "zod";
function registerSubmitRevision(server, storage2) {
  server.tool("submit_revision", "Submit a revised file for a review that is in 'revision_requested' stage. Saves the current file to history and replaces it with the new content.", {
    review_id: z8.string().describe("The review ID in 'revision_requested' stage"),
    filename: z8.string().describe("The filename to revise"),
    content: z8.string().describe("New file content \u2014 UTF-8 text or base64-encoded binary"),
    content_type: z8.string().describe("MIME type of the file"),
    encoding: z8.enum(["utf-8", "base64"]).default("utf-8").describe("Encoding of the content field \u2014 'utf-8' for text, 'base64' for binary")
  }, async (args) => {
    try {
      const status = await storage2.readStatus(args.review_id);
      if (status.stage !== "revision_requested") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Cannot submit revision: review is in stage '${status.stage}', expected 'revision_requested'`
              })
            }
          ],
          isError: true
        };
      }
      try {
        await storage2.saveFileToHistory(args.review_id, args.filename, status.revision_number);
      } catch {
      }
      await storage2.addFile(args.review_id, args.filename, args.content, args.content_type, args.encoding);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, path: args.filename })
          }
        ]
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error }) }],
        isError: true
      };
    }
  });
}

// ../mcp/dist/tools/complete-revision.js
import { z as z9 } from "zod";
function registerCompleteRevision(server, engine, reviewUrl) {
  server.tool("complete_revision", "Mark a revision as complete and re-enter the pipeline. The review must be in 'revision_requested' stage. Call this after using submit_revision to update all necessary files.", {
    review_id: z9.string().describe("The review ID in 'revision_requested' stage")
  }, async (args) => {
    try {
      const result = await engine.completeRevision(args.review_id);
      const url = await reviewUrl(args.review_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              stage: result.stage,
              message: result.message,
              review_url: url
            })
          }
        ]
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error }) }],
        isError: true
      };
    }
  });
}

// ../mcp/dist/tools/list-policies.js
function registerListPolicies(server, storage2) {
  server.tool("list_policies", "List all available review policies. Policy names can be used when creating a review.", {}, async () => {
    try {
      const names = await storage2.listPolicies();
      const policies = await Promise.all(names.map(async (name) => {
        const config = await storage2.readPolicy(name);
        return {
          name: config.name,
          stages: config.stages,
          max_revisions: config.max_revisions
        };
      }));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ policies })
          }
        ]
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error }) }],
        isError: true
      };
    }
  });
}

// ../mcp/dist/tools/submit-deliverable.js
import { z as z10 } from "zod";
var fileSchema = z10.object({
  source_path: z10.string().optional().describe("Absolute path to a file on disk. AROS copies it into the review. Preferred for large files, images, and binaries"),
  content: z10.string().optional().describe("Inline file content (UTF-8 text or base64). Use source_path for large files"),
  filename: z10.string().optional().describe("Name for the file (e.g. 'report.md'). Required with inline content, optional with source_path (defaults to source filename)"),
  content_type: z10.string().optional().describe("MIME type. Auto-detected from filename if omitted"),
  encoding: z10.enum(["utf-8", "base64"]).default("utf-8").describe("Encoding of content field. Ignored with source_path")
});
function registerSubmitDeliverable(server, storage2, engine, reviewUrl) {
  server.tool("submit_deliverable", "All-in-one: create a review, attach files, and submit to the pipeline in a single call. Use this instead of calling create_review + add_file + submit_for_review separately.", {
    title: z10.string().describe("Title of the deliverable"),
    brief: z10.string().describe("Brief description or requirements for the deliverable"),
    policy: z10.string().default("default").describe("Policy name (defaults to 'default')"),
    source_agent: z10.string().describe("Identifier for the submitting agent"),
    content_type: z10.string().describe("MIME type or description of the content (e.g. 'image/png', 'text/markdown')"),
    files: z10.array(fileSchema).min(1).describe("Files to attach. Each needs either source_path (for files on disk) or content + filename (for inline)"),
    folder_strategy: z10.enum(["all_pass", "select", "rank", "categorize"]).optional().describe("Folder review strategy when multiple files are submitted"),
    notification_driver: z10.string().optional().describe("Notification driver name"),
    notification_target: z10.record(z10.unknown()).optional().describe("Notification target config (driver-specific)"),
    notification_events: z10.array(z10.enum(["approved", "revision_requested", "rejected"])).optional().describe("Events to trigger notifications for")
  }, async (args) => {
    try {
      if (args.notification_driver && args.notification_target) {
        const driver = getDriver(args.notification_driver);
        if (!driver) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `Unknown notification driver: ${args.notification_driver}`
                })
              }
            ],
            isError: true
          };
        }
        const validation = driver.validateTarget(args.notification_target);
        if (!validation.valid) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `Invalid notification target: ${validation.error}`
                })
              }
            ],
            isError: true
          };
        }
      }
      for (let i = 0; i < args.files.length; i++) {
        const f = args.files[i];
        if (f.source_path && f.content) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `files[${i}]: provide either source_path or content, not both`
                })
              }
            ],
            isError: true
          };
        }
        if (!f.source_path && !f.content) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `files[${i}]: provide either source_path or content`
                })
              }
            ],
            isError: true
          };
        }
        if (!f.source_path && !f.filename) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `files[${i}]: filename is required when using inline content`
                })
              }
            ],
            isError: true
          };
        }
      }
      const meta = {
        title: args.title,
        brief: args.brief,
        policy: args.policy,
        source_agent: args.source_agent,
        content_type: args.content_type,
        ...args.folder_strategy ? { folder_strategy: args.folder_strategy } : {},
        ...args.notification_driver && args.notification_target ? {
          notification: {
            driver: args.notification_driver,
            target: args.notification_target,
            events: args.notification_events ?? [
              "approved",
              "revision_requested",
              "rejected"
            ]
          }
        } : {}
      };
      const review_id = await storage2.createReview(meta);
      const addedFiles = [];
      for (const f of args.files) {
        if (f.source_path) {
          const result2 = await storage2.addFileFromPath(review_id, f.source_path, f.filename);
          addedFiles.push(result2);
        } else {
          await storage2.addFile(review_id, f.filename, f.content, f.content_type ?? "application/octet-stream", f.encoding);
          addedFiles.push({ filename: f.filename });
        }
      }
      const result = await engine.submit(review_id);
      const url = await reviewUrl(review_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              review_id,
              review_url: url,
              stage: result.stage,
              message: result.message,
              files_added: addedFiles.length
            })
          }
        ]
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: JSON.stringify({ error }) }],
        isError: true
      };
    }
  });
}

// ../mcp/dist/tools/index.js
async function createReviewUrlFn(storage2) {
  let port = 4100;
  try {
    const config = await storage2.getConfig();
    port = config.port ?? 4100;
  } catch {
  }
  return (id) => Promise.resolve(`http://localhost:${port}/reviews/${id}`);
}
async function registerAllTools(server, storage2, engine) {
  const reviewUrl = await createReviewUrlFn(storage2);
  registerCreateReview(server, storage2, reviewUrl);
  registerAddFile(server, storage2);
  registerSubmitForReview(server, engine, reviewUrl);
  registerCheckStatus(server, storage2, reviewUrl);
  registerGetFeedback(server, storage2);
  registerListMyReviews(server, storage2);
  registerReadFile(server, storage2);
  registerSubmitRevision(server, storage2);
  registerCompleteRevision(server, engine, reviewUrl);
  registerListPolicies(server, storage2);
  registerSubmitDeliverable(server, storage2, engine, reviewUrl);
}

// ../mcp/dist/index.js
var projectDir = process.argv.find((_, i, arr) => arr[i - 1] === "--project") ?? process.cwd();
var storage = new Storage(projectDir);
storage.isInitialized().then((initialized) => {
  if (!initialized) {
    console.error(`[AROS MCP] Project not initialized at ${projectDir}. Run 'npx aros' first.`);
    process.exit(1);
  }
  registerDriver(paperclipDriver);
  const engine = new PipelineEngine(storage);
  const server = new McpServer({ name: "aros", version: "0.1.0" });
  registerAllTools(server, storage, engine).then(() => {
    const transport = new StdioServerTransport();
    server.connect(transport).catch((err) => {
      console.error("[AROS MCP] Failed:", err);
      process.exit(1);
    });
  });
});
