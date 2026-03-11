import * as path from "node:path";
import * as prompts from "@clack/prompts";
import { Storage } from "@aros/server";

export async function initProject(): Promise<string> {
  prompts.intro("Welcome to AROS — Agent Review Orchestration Service");

  const dirResult = await prompts.text({
    message: "Project directory?",
    initialValue: "./aros",
    validate: (val) => (val.trim() ? undefined : "Directory is required"),
  });

  if (prompts.isCancel(dirResult)) {
    prompts.cancel("Setup cancelled.");
    process.exit(0);
  }

  const projectDir = path.resolve(dirResult as string);
  const storage = new Storage(projectDir);
  await storage.init();

  prompts.log.success(`Created project at ${projectDir}`);
  return projectDir;
}
