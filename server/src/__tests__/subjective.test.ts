import { describe, it, expect } from "vitest";
import {
  buildSubjectivePrompt,
  parseSubjectiveResponse,
  computeWeightedScore,
} from "../pipeline/subjective.js";
import type { PolicySubjectiveCriterion, SubjectiveCriterion } from "@aros/types";

// ---- buildSubjectivePrompt() ----

describe("buildSubjectivePrompt()", () => {
  const criteria: PolicySubjectiveCriterion[] = [
    { name: "relevance", description: "How well does it match the brief?", weight: 3, scale: 10 },
    { name: "quality", description: "Overall production quality", weight: 2, scale: 10 },
  ];

  it("includes the brief in the user message content", () => {
    const { messages } = buildSubjectivePrompt(
      "Create a hero banner for Paperclip",
      [{ type: "text", content: "Here is the deliverable text." }],
      criteria
    );
    const userContent = messages[0].content;
    const combinedText =
      typeof userContent === "string"
        ? userContent
        : userContent
            .map((b) => ("text" in b ? b.text : ""))
            .join(" ");
    expect(combinedText).toContain("Create a hero banner for Paperclip");
  });

  it("includes all criterion names in the user message", () => {
    const { messages } = buildSubjectivePrompt(
      "A brief",
      [{ type: "text", content: "content" }],
      criteria
    );
    const userContent = messages[0].content;
    const combinedText =
      typeof userContent === "string"
        ? userContent
        : userContent
            .map((b) => ("text" in b ? b.text : ""))
            .join(" ");
    expect(combinedText).toContain("relevance");
    expect(combinedText).toContain("quality");
  });

  it("returns a system string that mentions JSON", () => {
    const { system } = buildSubjectivePrompt("brief", [], criteria);
    expect(typeof system).toBe("string");
    expect(system.toLowerCase()).toContain("json");
  });

  it("handles image content blocks using Anthropic vision format", () => {
    const fakeBase64 = "iVBORw0KGgoAAAANS";
    const { messages } = buildSubjectivePrompt(
      "A brief",
      [
        { type: "image", content: fakeBase64, mediaType: "image/png" },
      ],
      criteria
    );
    const blocks = messages[0].content as unknown[];
    const imageBlock = blocks.find(
      (b) => typeof b === "object" && b !== null && (b as Record<string, unknown>).type === "image"
    ) as Record<string, unknown> | undefined;
    expect(imageBlock).toBeDefined();
    const source = (imageBlock as Record<string, unknown>).source as Record<string, unknown>;
    expect(source.type).toBe("base64");
    expect(source.data).toBe(fakeBase64);
    expect(source.media_type).toBe("image/png");
  });

  it("produces messages array with one user message", () => {
    const { messages } = buildSubjectivePrompt("brief", [], criteria);
    expect(Array.isArray(messages)).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
  });
});

// ---- parseSubjectiveResponse() ----

describe("parseSubjectiveResponse()", () => {
  const criteria: PolicySubjectiveCriterion[] = [
    { name: "relevance", description: "Match", weight: 3, scale: 10 },
    { name: "quality", description: "Quality", weight: 2, scale: 10 },
  ];

  it("parses a plain JSON response", () => {
    const raw = JSON.stringify({
      scores: [
        { name: "relevance", score: 8, rationale: "Good match" },
        { name: "quality", score: 7, rationale: "Decent quality" },
      ],
    });
    const results = parseSubjectiveResponse(raw, criteria);
    expect(results).toHaveLength(2);
    const rel = results.find((r) => r.name === "relevance");
    expect(rel).toBeDefined();
    expect(rel!.score).toBe(8);
    expect(rel!.weight).toBe(3);
    expect(rel!.scale).toBe(10);
    expect(rel!.rationale).toBe("Good match");
  });

  it("handles markdown code block wrapping (```json ... ```)", () => {
    const raw = "```json\n" + JSON.stringify({
      scores: [
        { name: "relevance", score: 9, rationale: "Excellent" },
        { name: "quality", score: 6, rationale: "OK" },
      ],
    }) + "\n```";
    const results = parseSubjectiveResponse(raw, criteria);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.name === "relevance")!.score).toBe(9);
  });

  it("handles plain ``` code block wrapping", () => {
    const raw = "```\n" + JSON.stringify({
      scores: [
        { name: "relevance", score: 5, rationale: "Fair" },
        { name: "quality", score: 4, rationale: "Poor" },
      ],
    }) + "\n```";
    const results = parseSubjectiveResponse(raw, criteria);
    expect(results).toHaveLength(2);
  });

  it("maps weight and scale from criteria for each result", () => {
    const raw = JSON.stringify({
      scores: [
        { name: "relevance", score: 7, rationale: "r1" },
        { name: "quality", score: 5, rationale: "r2" },
      ],
    });
    const results = parseSubjectiveResponse(raw, criteria);
    const qual = results.find((r) => r.name === "quality")!;
    expect(qual.weight).toBe(2);
    expect(qual.scale).toBe(10);
  });

  it("returns SubjectiveCriterion[] shaped objects", () => {
    const raw = JSON.stringify({
      scores: [
        { name: "relevance", score: 6, rationale: "Okay" },
        { name: "quality", score: 6, rationale: "Okay" },
      ],
    });
    const results = parseSubjectiveResponse(raw, criteria);
    for (const r of results) {
      expect(typeof r.name).toBe("string");
      expect(typeof r.score).toBe("number");
      expect(typeof r.weight).toBe("number");
      expect(typeof r.scale).toBe("number");
      expect(typeof r.rationale).toBe("string");
    }
  });
});

// ---- computeWeightedScore() ----

describe("computeWeightedScore()", () => {
  it("computes the correct weighted average: scores [8,6] weights [3,2] => 7.2", () => {
    const results: SubjectiveCriterion[] = [
      { name: "relevance", score: 8, weight: 3, scale: 10, rationale: "Good" },
      { name: "quality", score: 6, weight: 2, scale: 10, rationale: "OK" },
    ];
    // (8*3 + 6*2) / (3+2) = (24 + 12) / 5 = 36/5 = 7.2
    expect(computeWeightedScore(results)).toBeCloseTo(7.2, 5);
  });

  it("returns the score itself when there is only one criterion", () => {
    const results: SubjectiveCriterion[] = [
      { name: "only", score: 9, weight: 1, scale: 10, rationale: "Great" },
    ];
    expect(computeWeightedScore(results)).toBe(9);
  });

  it("handles equal weights as a simple average", () => {
    const results: SubjectiveCriterion[] = [
      { name: "a", score: 4, weight: 1, scale: 10, rationale: "" },
      { name: "b", score: 8, weight: 1, scale: 10, rationale: "" },
    ];
    expect(computeWeightedScore(results)).toBeCloseTo(6, 5);
  });

  it("handles all-zero scores", () => {
    const results: SubjectiveCriterion[] = [
      { name: "a", score: 0, weight: 2, scale: 10, rationale: "" },
      { name: "b", score: 0, weight: 3, scale: 10, rationale: "" },
    ];
    expect(computeWeightedScore(results)).toBe(0);
  });

  it("returns 0 when results array is empty", () => {
    expect(computeWeightedScore([])).toBe(0);
  });
});
