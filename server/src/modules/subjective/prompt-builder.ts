import type { CriterionDef, FileEntry, PolicySubjectiveCriterion } from "@aros/types";

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicImageBlock {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
}

export interface SubjectivePromptResult {
  system: string;
  messages: AnthropicMessage[];
}

export function buildSubjectivePrompt(
  files: FileEntry[],
  brief: string,
  policyCriteria: PolicySubjectiveCriterion[],
  library: Map<string, CriterionDef>
): SubjectivePromptResult {
  const contentBlocks: AnthropicContentBlock[] = [];

  for (const file of files) {
    if (file.contentType.startsWith("image/")) {
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: file.contentType,
          data: file.content as string,
        },
      });
    } else {
      contentBlocks.push({
        type: "text",
        text: `<file name="${file.filename}">\n${file.content}\n</file>`,
      });
    }
  }

  const criteriaBlock = policyCriteria
    .map((pc, i) => {
      const def = library.get(pc.name);
      const description = pc.description ?? def?.description ?? "Evaluate this criterion.";
      const guidance = def?.promptGuidance ?? "";
      return `### ${i + 1}. ${pc.name} (weight: ${pc.weight}, scale: ${pc.scale})\n${description}\n${guidance}`;
    })
    .join("\n\n");

  contentBlocks.push({
    type: "text",
    text: `<brief>\n${brief}\n</brief>

<evaluation_criteria>
${criteriaBlock}
</evaluation_criteria>

Evaluate this deliverable against each criterion above.
Return a JSON object with this exact structure:
{
  "scores": [
    { "name": "criterion_name", "score": <number>, "rationale": "<2-3 sentences>" }
  ]
}`,
  });

  return {
    system:
      "You are a content quality reviewer. Evaluate the deliverable against the given criteria. Return only valid JSON.",
    messages: [{ role: "user", content: contentBlocks }],
  };
}
