import type {
  SubjectiveCriterion,
  PolicySubjectiveCriterion,
} from "@aros/types";

// ---- Content block types ----

export interface TextContentBlock {
  type: "text";
  content: string;
}

export interface ImageContentBlock {
  type: "image";
  content: string; // base64
  mediaType: string;
}

export type ContentBlock = TextContentBlock | ImageContentBlock;

// ---- Anthropic message types (minimal subset) ----

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicImageBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
}

export interface SubjectivePrompt {
  system: string;
  messages: AnthropicMessage[];
}

// ---- buildSubjectivePrompt ----

/**
 * Builds the system + messages payload for an Anthropic API call to score
 * the deliverable against the given subjective criteria.
 */
export function buildSubjectivePrompt(
  brief: string,
  contentBlocks: ContentBlock[],
  criteria: PolicySubjectiveCriterion[]
): SubjectivePrompt {
  const criteriaDescriptions = criteria
    .map(
      (c) =>
        `- ${c.name} (weight: ${c.weight}, scale: 0-${c.scale}): ${c.description}`
    )
    .join("\n");

  const criteriaNames = criteria.map((c) => c.name).join('", "');

  const system = `You are a quality reviewer evaluating creative and marketing deliverables.
Your task is to score the provided deliverable against specific quality criteria.
You must respond with a valid JSON object — no additional text, no markdown, no explanation outside JSON.

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

  const userContentBlocks: AnthropicContentBlock[] = [
    {
      type: "text",
      text: `${briefBlock}\n\n${criteriaBlock}\n\n## Deliverable`,
    },
  ];

  for (const block of contentBlocks) {
    if (block.type === "text") {
      userContentBlocks.push({
        type: "text",
        text: block.content,
      });
    } else if (block.type === "image") {
      userContentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: block.mediaType,
          data: block.content,
        },
      });
    }
  }

  userContentBlocks.push({
    type: "text",
    text: "Please evaluate the deliverable above and return your scores as JSON.",
  });

  return {
    system,
    messages: [
      {
        role: "user",
        content: userContentBlocks,
      },
    ],
  };
}

// ---- parseSubjectiveResponse ----

interface RawScore {
  name: string;
  score: number;
  rationale: string;
}

/**
 * Extracts JSON from a raw API response (handling markdown code blocks)
 * and maps each score to a SubjectiveCriterion with weight/scale from criteria.
 */
export function parseSubjectiveResponse(
  raw: string,
  criteria: PolicySubjectiveCriterion[]
): SubjectiveCriterion[] {
  // Strip markdown code blocks if present
  let json = raw.trim();
  if (json.startsWith("```")) {
    // Remove opening ``` or ```json
    json = json.replace(/^```[a-zA-Z]*\n?/, "");
    // Remove closing ```
    json = json.replace(/\n?```\s*$/, "");
    json = json.trim();
  }

  const parsed = JSON.parse(json) as { scores: RawScore[] };
  const scores: RawScore[] = parsed.scores ?? [];

  const criteriaMap = new Map<string, PolicySubjectiveCriterion>(
    criteria.map((c) => [c.name, c])
  );

  return scores.map((s) => {
    const criterion = criteriaMap.get(s.name);
    return {
      name: s.name,
      score: s.score,
      weight: criterion?.weight ?? 1,
      scale: criterion?.scale ?? 10,
      rationale: s.rationale,
    };
  });
}

// ---- computeWeightedScore ----

/**
 * Computes the weighted average of SubjectiveCriterion scores.
 * Returns (sum of score*weight) / (sum of weights), or 0 if empty.
 */
export function computeWeightedScore(results: SubjectiveCriterion[]): number {
  if (results.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const r of results) {
    weightedSum += r.score * r.weight;
    totalWeight += r.weight;
  }

  if (totalWeight === 0) return 0;

  return weightedSum / totalWeight;
}

// ---- runSubjectiveReview ----

export type SubjectiveReviewResult =
  | { results: SubjectiveCriterion[]; score: number }
  | { skipped: true; reason: string };

/**
 * Runs the full subjective review using the Anthropic API.
 * If ANTHROPIC_API_KEY is not set, returns { skipped: true, reason: "..." }.
 */
export async function runSubjectiveReview(
  brief: string,
  contentBlocks: ContentBlock[],
  criteria: PolicySubjectiveCriterion[],
  model: string
): Promise<SubjectiveReviewResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { skipped: true, reason: "ANTHROPIC_API_KEY not set" };
  }

  // Dynamic import to avoid loading the SDK at module parse time when not needed
  const Anthropic = await import("@anthropic-ai/sdk").then((m) => m.default ?? m);
  const client = new (Anthropic as new (opts: { apiKey: string }) => {
    messages: {
      create: (params: {
        model: string;
        max_tokens: number;
        system: string;
        messages: AnthropicMessage[];
      }) => Promise<{ content: Array<{ type: string; text?: string }> }>;
    };
  })({ apiKey });

  const prompt = buildSubjectivePrompt(brief, contentBlocks, criteria);

  let responseText: string;
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: prompt.system,
      messages: prompt.messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || !textBlock.text) {
      return { skipped: true, reason: "No text content in Anthropic response" };
    }
    responseText = textBlock.text;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { skipped: true, reason: `Anthropic API error: ${message}` };
  }

  let results: SubjectiveCriterion[];
  try {
    results = parseSubjectiveResponse(responseText, criteria);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { skipped: true, reason: `Failed to parse subjective response: ${message}` };
  }

  const score = computeWeightedScore(results);
  return { results, score };
}
