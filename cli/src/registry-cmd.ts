import * as path from "node:path";
import { Command } from "commander";
import { addSource, removeSource, readRegistry } from "@aros/server/modules/registry.js";

export function registryCommands(program: Command) {
  const registry = program.command("registry").description("Manage module source repos");

  registry
    .command("add <url>")
    .description("Add a source repo")
    .option("--name <name>", "Source name")
    .option("--branch <branch>", "Branch name", "main")
    .action((url: string, opts: { name?: string; branch: string }) => {
      const arosDir = path.join(process.cwd(), ".aros");
      const name = opts.name ?? url.split("/").pop()?.replace(".git", "") ?? "unnamed";
      addSource(arosDir, { name, url, branch: opts.branch });
      console.log(`Added source "${name}" → ${url} (${opts.branch})`);
    });

  registry
    .command("remove <name>")
    .description("Remove a source repo")
    .action((name: string) => {
      const arosDir = path.join(process.cwd(), ".aros");
      removeSource(arosDir, name);
      console.log(`Removed source "${name}"`);
    });

  registry
    .command("list")
    .description("List configured sources")
    .action(() => {
      const arosDir = path.join(process.cwd(), ".aros");
      const reg = readRegistry(arosDir);
      for (const s of reg.sources) {
        console.log(`  ${s.name}  ${s.url}  (${s.branch})`);
      }
    });
}
