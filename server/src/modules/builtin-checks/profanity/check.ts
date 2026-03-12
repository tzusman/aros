import type { CheckContext, CheckResult } from "@aros/types";

const DEFAULT_WORDS = [
  "damn", "hell", "ass", "crap", "bastard", "bitch", "shit", "fuck",
  "piss", "dick", "cock", "pussy", "whore", "slut", "cunt", "nigger", "faggot",
];

export default {
  async execute(ctx: CheckContext): Promise<CheckResult[]> {
    const wordList = (ctx.config.words as string[])?.length ? (ctx.config.words as string[]) : DEFAULT_WORDS;
    return ctx.files.map((file) => {
      if (typeof file.content !== "string") {
        return { name: "profanity", file: file.filename, passed: true, details: "Skipped — binary content." };
      }
      const lower = file.content.toLowerCase();
      const found = wordList.filter((w) => lower.includes(w.toLowerCase()));
      return {
        name: "profanity",
        file: file.filename,
        passed: found.length === 0,
        details: found.length === 0 ? "No prohibited words detected." : `Found: ${found.join(", ")}`,
      };
    });
  },
};
