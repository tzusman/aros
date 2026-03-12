import { describe, it, expect } from "vitest";
import { buildSubjectivePrompt } from "../modules/subjective/prompt-builder.js";
import type { CriterionDef } from "@aros/types";

const library = new Map<string, CriterionDef>([
  ["tone", {
    name: "tone",
    description: "Tone alignment",
    applicableTo: ["text/*"],
    defaultWeight: 2,
    scale: 10,
    promptGuidance: "Check if tone matches brief",
  }],
  ["visual", {
    name: "visual",
    description: "Visual quality",
    applicableTo: ["image/*"],
    defaultWeight: 3,
    scale: 10,
    promptGuidance: "Check visual appeal",
  }],
]);

describe("buildSubjectivePrompt", () => {
  it("builds prompt for text files with matching criteria", () => {
    const result = buildSubjectivePrompt(
      [{ filename: "post.md", content: "# Hello", contentType: "text/markdown", sizeBytes: 7 }],
      "Write a blog post",
      [{ name: "tone", weight: 3, scale: 10 }],
      library
    );
    expect(result.messages).toHaveLength(1);
    const text = result.messages[0].content.find((b: any) => b.type === "text" && b.text.includes("evaluation_criteria"));
    expect(text).toBeDefined();
    expect((text as any).text).toContain("tone");
    expect((text as any).text).toContain("Check if tone matches brief");
  });

  it("builds prompt for image files with vision blocks", () => {
    const result = buildSubjectivePrompt(
      [{ filename: "hero.png", content: "base64data", contentType: "image/png", sizeBytes: 100 }],
      "Create a hero image",
      [{ name: "visual", weight: 2, scale: 10 }],
      library
    );
    const imageBlock = result.messages[0].content.find((b: any) => b.type === "image");
    expect(imageBlock).toBeDefined();
  });

  it("returns valid JSON instruction in prompt", () => {
    const result = buildSubjectivePrompt(
      [{ filename: "post.md", content: "# Hello", contentType: "text/markdown", sizeBytes: 7 }],
      "Write a blog post",
      [{ name: "tone", weight: 3, scale: 10 }],
      library
    );
    const evalBlock = result.messages[0].content.find(
      (b: any) => b.type === "text" && b.text.includes('"scores"')
    );
    expect(evalBlock).toBeDefined();
  });
});
