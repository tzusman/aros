import type { SubjectiveCriterion, PolicySubjectiveCriterion } from "@aros/types";

/**
 * Extract JSON from Claude's response. Handles:
 * 1. Raw JSON string
 * 2. Markdown ```json ... ``` code blocks
 */
export function extractJSON(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (match) return JSON.parse(match[1].trim());
    throw new Error("Could not extract JSON from response");
  }
}

export function parseSubjectiveResponse(
  responseText: string,
  policyCriteria: PolicySubjectiveCriterion[]
): SubjectiveCriterion[] {
  const json = extractJSON(responseText);
  return json.scores.map((s: any) => {
    const pc = policyCriteria.find((c) => c.name === s.name);
    return {
      name: s.name,
      score: s.score,
      weight: pc?.weight ?? 1,
      scale: pc?.scale ?? 10,
      rationale: s.rationale,
    };
  });
}

/**
 * Compute normalized weighted score on 0-10 scale.
 * Each score is normalized by its scale before weighting.
 */
export function computeWeightedScore(scores: SubjectiveCriterion[]): number {
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return 0;
  const weightedSum = scores.reduce(
    (sum, s) => sum + (s.score / s.scale) * 10 * s.weight,
    0
  );
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}
