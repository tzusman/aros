import { describe, it, expect } from "vitest";
import {
  extractJSON,
  parseSubjectiveResponse,
  computeWeightedScore,
} from "../modules/subjective/response-parser.js";

describe("extractJSON", () => {
  it("parses raw JSON", () => {
    const result = extractJSON('{"scores": []}');
    expect(result.scores).toEqual([]);
  });

  it("extracts JSON from markdown code block", () => {
    const result = extractJSON('Here is the evaluation:\n```json\n{"scores": [{"name": "tone", "score": 8, "rationale": "good"}]}\n```');
    expect(result.scores).toHaveLength(1);
  });

  it("throws on unparseable text", () => {
    expect(() => extractJSON("no json here")).toThrow(/could not extract/i);
  });
});

describe("parseSubjectiveResponse", () => {
  it("maps scores to SubjectiveCriterion with policy weights", () => {
    const responseText = JSON.stringify({
      scores: [
        { name: "tone", score: 8, rationale: "Good tone" },
        { name: "clarity", score: 6, rationale: "Needs work" },
      ],
    });
    const criteria = [
      { name: "tone", weight: 3, scale: 10 },
      { name: "clarity", weight: 2, scale: 10 },
    ];
    const result = parseSubjectiveResponse(responseText, criteria);
    expect(result).toHaveLength(2);
    expect(result[0].weight).toBe(3);
    expect(result[1].score).toBe(6);
    expect(result[1].rationale).toBe("Needs work");
  });
});

describe("computeWeightedScore", () => {
  it("computes normalized weighted average on 0-10 scale", () => {
    const scores = [
      { name: "a", score: 8, weight: 3, scale: 10, rationale: "" },
      { name: "b", score: 6, weight: 2, scale: 10, rationale: "" },
    ];
    // (8/10*10*3 + 6/10*10*2) / (3+2) = (24+12)/5 = 7.2
    expect(computeWeightedScore(scores)).toBe(7.2);
  });

  it("normalizes different scales", () => {
    const scores = [
      { name: "a", score: 4, weight: 1, scale: 5, rationale: "" },
      { name: "b", score: 8, weight: 1, scale: 10, rationale: "" },
    ];
    // (4/5*10*1 + 8/10*10*1) / (1+1) = (8+8)/2 = 8.0
    expect(computeWeightedScore(scores)).toBe(8.0);
  });

  it("returns 0 for empty scores", () => {
    expect(computeWeightedScore([])).toBe(0);
  });
});
