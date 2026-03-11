#!/usr/bin/env node

// src/index.ts
import * as fs4 from "fs";
import * as path5 from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { Command } from "commander";
import pc2 from "picocolors";
import * as prompts2 from "@clack/prompts";

// ../server/dist/index.js
import * as path3 from "path";
import express from "express";

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
  constructor(projectDir) {
    this.projectDir = projectDir;
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
  constructor(storage, emitSSE) {
    this.storage = storage;
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

// ../server/dist/sse.js
import { watch } from "chokidar";
var SSEBroadcaster = class {
  clients = /* @__PURE__ */ new Set();
  watcher = null;
  addClient(res) {
    this.clients.add(res);
    res.on("close", () => {
      this.clients.delete(res);
    });
  }
  emit(event, data) {
    const payload = JSON.stringify({ type: event, data });
    const message = `data: ${payload}

`;
    for (const client of this.clients) {
      client.write(message);
    }
  }
  startWatching(reviewDir) {
    if (this.watcher) {
      void this.watcher.close();
    }
    this.watcher = watch(reviewDir, {
      persistent: false,
      ignoreInitial: true,
      depth: 3
    });
    const onFileEvent = (filePath) => {
      if (filePath.endsWith("status.json") || filePath.endsWith("meta.json")) {
        this.emit("fs:changed", { path: filePath });
      }
    };
    this.watcher.on("change", onFileEvent);
    this.watcher.on("add", onFileEvent);
  }
  stop() {
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = null;
    }
    this.clients.clear();
  }
};

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

// ../server/dist/routes/deliverables.js
import { Router } from "express";
function deliverableRoutes(storage, engine, apiBaseUrl) {
  const router = Router();
  router.get("/", async (req, res, next) => {
    try {
      const stage = req.query["stage"];
      const filter = stage ? { stage } : void 0;
      const deliverables = await storage.listReviews(filter);
      res.json(deliverables);
    } catch (err) {
      next(err);
    }
  });
  router.get("/:id", async (req, res, next) => {
    try {
      const { id } = req.params;
      const deliverable = await storage.getFullDeliverable(id, apiBaseUrl);
      res.json(deliverable);
    } catch (err) {
      next(err);
    }
  });
  router.post("/:id/decision", async (req, res, next) => {
    try {
      const { id } = req.params;
      const payload = req.body;
      await engine.decide(id, payload);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
  return router;
}

// ../server/dist/routes/files.js
import { Router as Router2 } from "express";
import * as fs2 from "fs";
import mime2 from "mime-types";

// ../server/dist/errors.js
var HttpError = class extends Error {
  status;
  details;
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
};
function notFound(message = "Not found") {
  return new HttpError(404, message);
}
function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.message,
      ...err.details !== void 0 ? { details: err.details } : {}
    });
    return;
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("Unhandled error:", err);
  res.status(500).json({ error: message });
}

// ../server/dist/routes/files.js
function fileRoutes(storage) {
  const router = Router2();
  router.get("/:id/files/:filename", async (req, res, next) => {
    try {
      const { id, filename } = req.params;
      const filePath = await storage.getFilePath(id, filename);
      if (!filePath) {
        throw notFound(`File not found: ${filename} in review ${id}`);
      }
      const contentType = mime2.lookup(filename) || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-cache");
      const stream = fs2.createReadStream(filePath);
      stream.on("error", next);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  });
  return router;
}

// ../server/dist/routes/pipeline.js
import { Router as Router3 } from "express";
function pipelineRoutes(storage) {
  const router = Router3();
  router.get("/counts", async (_req, res, next) => {
    try {
      const reviews = await storage.listReviews();
      const now = Date.now();
      const ms72h = 72 * 60 * 60 * 1e3;
      const counts = {
        in_progress: 0,
        pending_human: 0,
        awaiting_revisions: 0,
        approved_72h: 0,
        rejected_72h: 0
      };
      for (const review of reviews) {
        const { stage } = review;
        if (stage === "human") {
          counts.pending_human++;
        } else if (stage === "revision_requested") {
          counts.awaiting_revisions++;
        } else if (stage === "objective" || stage === "subjective" || stage === "draft") {
          counts.in_progress++;
        } else if (stage === "approved") {
          const enteredAt = new Date(review.entered_stage_at).getTime();
          if (now - enteredAt <= ms72h) {
            counts.approved_72h++;
          }
        } else if (stage === "rejected") {
          const enteredAt = new Date(review.entered_stage_at).getTime();
          if (now - enteredAt <= ms72h) {
            counts.rejected_72h++;
          }
        }
      }
      res.json(counts);
    } catch (err) {
      next(err);
    }
  });
  return router;
}

// ../server/dist/routes/policies.js
import { Router as Router4 } from "express";
function policyRoutes(storage) {
  const router = Router4();
  router.get("/", async (_req, res, next) => {
    try {
      const names = await storage.listPolicies();
      const policies = await Promise.all(names.map(async (name) => {
        const policy = await storage.readPolicy(name);
        return {
          name: policy.name,
          stages: policy.stages,
          max_revisions: policy.max_revisions
        };
      }));
      res.json(policies);
    } catch (err) {
      next(err);
    }
  });
  router.get("/:name", async (req, res, next) => {
    try {
      const { name } = req.params;
      const policy = await storage.readPolicy(name);
      res.json(policy);
    } catch (err) {
      next(err);
    }
  });
  router.put("/:name", async (req, res, next) => {
    try {
      const { name } = req.params;
      const policy = req.body;
      await storage.writePolicy(name, policy);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
  router.delete("/:name", async (req, res, next) => {
    try {
      const { name } = req.params;
      await storage.deletePolicy(name);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
  return router;
}

// ../server/dist/index.js
function createServer(options) {
  const { projectDir, dashboardDir } = options;
  const storage = new Storage(projectDir);
  registerDriver(paperclipDriver);
  const sse = new SSEBroadcaster();
  const emitFn = (event, data) => {
    sse.emit(event, data);
  };
  const engine = new PipelineEngine(storage, emitFn);
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (_req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  let resolvedPort = options.port ?? 4100;
  const getApiBaseUrl = () => `http://localhost:${resolvedPort}`;
  app.use("/api/deliverables", deliverableRoutes(storage, engine, getApiBaseUrl()));
  app.use("/api/deliverables", fileRoutes(storage));
  app.use("/api/pipeline", pipelineRoutes(storage));
  app.use("/api/policies", policyRoutes(storage));
  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    sse.addClient(res);
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 3e4);
    req.on("close", () => {
      clearInterval(heartbeat);
    });
  });
  if (dashboardDir) {
    app.use(express.static(dashboardDir));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path3.join(dashboardDir, "index.html"));
    });
  }
  app.use(errorHandler);
  let server = null;
  const start = async (portOverride) => {
    await storage.init();
    if (portOverride != null) {
      resolvedPort = portOverride;
    } else {
      try {
        const config = await storage.getConfig();
        resolvedPort = options.port ?? config.port ?? 4100;
      } catch {
        resolvedPort = options.port ?? 4100;
      }
    }
    sse.startWatching(path3.join(options.projectDir, ".aros"));
    return new Promise((resolve3, reject) => {
      server = app.listen(resolvedPort);
      server.on("listening", () => resolve3());
      server.on("error", reject);
    });
  };
  const stop = async () => {
    sse.stop();
    return new Promise((resolve3, reject) => {
      if (!server) {
        resolve3();
        return;
      }
      server.close((err) => {
        if (err)
          reject(err);
        else
          resolve3();
      });
    });
  };
  return {
    app,
    storage,
    engine,
    sse,
    start,
    stop,
    get port() {
      return resolvedPort;
    }
  };
}

// src/serve.ts
import * as fs3 from "fs";
import * as net from "net";
import * as path4 from "path";
import * as prompts from "@clack/prompts";
import pc from "picocolors";
function isPortFree(port) {
  return new Promise((resolve3) => {
    const srv = net.createServer();
    srv.once("error", () => resolve3(false));
    srv.once("listening", () => {
      srv.close(() => resolve3(true));
    });
    srv.listen(port);
  });
}
async function findFreePort(start) {
  for (let port = start; port < start + 100; port++) {
    if (await isPortFree(port)) return port;
  }
  return start + 100;
}
async function serve(projectDir, onReady) {
  const dashboardDir = findDashboardDist();
  const server = createServer({
    projectDir,
    dashboardDir
  });
  let started = false;
  while (!started) {
    try {
      await server.start();
      started = true;
    } catch (err) {
      if (err.code === "EADDRINUSE") {
        const port = server.port;
        const nextFree = await findFreePort(port + 1);
        console.log();
        console.log(`  ${pc.yellow("!")}  Port ${pc.bold(String(port))} is already in use`);
        console.log();
        const answer = await prompts.confirm({
          message: `Use port ${pc.bold(String(nextFree))} instead?`
        });
        if (prompts.isCancel(answer) || !answer) {
          process.exit(1);
        }
        await server.start(nextFree);
        started = true;
      } else {
        throw err;
      }
    }
  }
  if (onReady) {
    onReady(server.port);
  }
  process.on("SIGINT", () => {
    server.stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    server.stop();
    process.exit(0);
  });
}
function findDashboardDist() {
  const here = new URL(".", import.meta.url).pathname;
  const candidates = [
    path4.resolve(here, "../../dashboard/dist"),
    path4.resolve(here, "../../../dashboard/dist")
  ];
  for (const dir of candidates) {
    try {
      if (fs3.existsSync(path4.join(dir, "index.html"))) return dir;
    } catch {
    }
  }
  return void 0;
}

// src/index.ts
var VERSION = "0.1.0";
var mcpEntryPath = fileURLToPath(new URL("./mcp-entry.js", import.meta.url));
function hasClaudeCli() {
  try {
    execSync("claude --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function configureMcp(projectDir) {
  if (hasClaudeCli()) {
    try {
      execSync(
        `claude mcp add -s project aros -- node ${mcpEntryPath} --project ${projectDir}`,
        { cwd: projectDir, stdio: "ignore" }
      );
      return;
    } catch {
    }
  }
  const mcpConfigPath = path5.join(projectDir, ".mcp.json");
  const arosServer = {
    command: "node",
    args: [mcpEntryPath, "--project", projectDir]
  };
  let config = {};
  if (fs4.existsSync(mcpConfigPath)) {
    try {
      config = JSON.parse(fs4.readFileSync(mcpConfigPath, "utf-8"));
    } catch {
    }
  }
  const servers = config.mcpServers ?? {};
  servers["aros"] = arosServer;
  config.mcpServers = servers;
  fs4.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2) + "\n");
}
function whitelistMcpTools(projectDir) {
  const settingsDir = path5.join(projectDir, ".claude");
  const settingsPath = path5.join(settingsDir, "settings.json");
  let settings = {};
  if (fs4.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs4.readFileSync(settingsPath, "utf-8"));
    } catch {
    }
  }
  const permissions = settings.permissions ?? {};
  const allow = permissions.allow ?? [];
  const rule = "mcp__aros__*";
  if (!allow.includes(rule)) {
    allow.push(rule);
  }
  permissions.allow = allow;
  settings.permissions = permissions;
  if (!fs4.existsSync(settingsDir)) {
    fs4.mkdirSync(settingsDir, { recursive: true });
  }
  fs4.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}
var CLAUDE_MD_SECTION = `
## AROS Review Pipeline

This project uses AROS for AI deliverable review. When you produce work products (documents, code artifacts, images) that need human review, submit them through the AROS MCP tools:

1. \`submit_deliverable\` to create a review, attach files, and submit in one call (preferred)
2. \`check_status\` / \`get_feedback\` to check on reviews
3. \`submit_revision\` \u2192 \`complete_revision\` if revisions are requested

The AROS server must be running for the MCP tools to work.
`;
function configureClaudeMd(projectDir) {
  const claudeMdPath = path5.join(projectDir, "CLAUDE.md");
  let content = "";
  if (fs4.existsSync(claudeMdPath)) {
    content = fs4.readFileSync(claudeMdPath, "utf-8");
    if (content.includes("AROS Review Pipeline")) return;
    content = content.trimEnd() + "\n";
  }
  content += CLAUDE_MD_SECTION;
  fs4.writeFileSync(claudeMdPath, content);
}
async function firstRunSetup(projectDir) {
  const result = { configured: false, whitelisted: false };
  console.log();
  console.log(
    `  ${pc2.cyan(pc2.bold("First-time setup"))} ${pc2.dim("for")} ${pc2.bold(path5.basename(projectDir))}`
  );
  console.log();
  const setupMcp = await prompts2.confirm({
    message: "Register AROS MCP tools with Claude Code?",
    initialValue: true
  });
  if (prompts2.isCancel(setupMcp)) return result;
  if (setupMcp) {
    configureMcp(projectDir);
    configureClaudeMd(projectDir);
    result.configured = true;
    const whitelist = await prompts2.confirm({
      message: "Auto-approve AROS tool calls? (skip permission prompts)",
      initialValue: true
    });
    if (!prompts2.isCancel(whitelist) && whitelist) {
      whitelistMcpTools(projectDir);
      result.whitelisted = true;
    }
  }
  return result;
}
function printBanner(port, projectDir, startMs, firstRun) {
  const elapsed = Math.round(performance.now() - startMs);
  console.log();
  console.log(
    `  ${pc2.green(pc2.bold("AROS"))} ${pc2.green(`v${VERSION}`)}  ${pc2.dim(`ready in ${pc2.bold(String(elapsed))} ms`)}`
  );
  console.log();
  console.log(
    `  ${pc2.green("\u279C")}  ${pc2.bold("Local")}:    ${pc2.cyan(`http://localhost:${pc2.bold(String(port))}/`)}`
  );
  console.log(
    `  ${pc2.green("\u279C")}  ${pc2.bold("Project")}:  ${pc2.dim(projectDir)}`
  );
  if (firstRun?.configured) {
    console.log();
    console.log(
      `  ${pc2.green("\u2714")}  Registered MCP tools ${pc2.dim("\u2014 Claude Code will auto-discover AROS")}`
    );
    console.log(
      `  ${pc2.green("\u2714")}  Updated ${pc2.bold("CLAUDE.md")} ${pc2.dim("\u2014 agents will know how to submit reviews")}`
    );
    if (firstRun.whitelisted) {
      console.log(
        `  ${pc2.green("\u2714")}  Whitelisted tool calls ${pc2.dim("\u2014 no permission prompts for AROS")}`
      );
    }
  }
  console.log();
}
var program = new Command();
program.name("aros").description("AROS \u2014 Agent Review Orchestration Service").version(VERSION);
program.argument("[project]", "Project directory").action(async (projectArg) => {
  const startMs = performance.now();
  let projectDir;
  projectDir = path5.resolve(projectArg ?? process.cwd());
  const storage = new Storage(projectDir);
  const wasInitialized = await storage.isInitialized();
  if (!wasInitialized) {
    await storage.init();
  }
  let firstRun = null;
  const mcpConfigPath = path5.join(projectDir, ".mcp.json");
  const hasClaudeSettings = fs4.existsSync(
    path5.join(projectDir, ".claude", "settings.json")
  );
  if (!fs4.existsSync(mcpConfigPath) && !hasClaudeSettings) {
    firstRun = await firstRunSetup(projectDir);
  }
  await serve(projectDir, (port) => {
    printBanner(port, projectDir, startMs, firstRun);
  });
});
program.command("mcp").description("Start MCP server (STDIO transport)").requiredOption("--project <dir>", "Project directory").action(async (opts) => {
  const { spawn } = await import("child_process");
  const child = spawn("node", [mcpEntryPath, "--project", opts.project], {
    stdio: "inherit"
    // Pass stdin/stdout through for JSON-RPC
  });
  child.on("exit", (code) => process.exit(code ?? 0));
});
program.parse();
