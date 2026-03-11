import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import pc from "picocolors";
import { Storage } from "@aros/server";
import { initProject } from "./init.js";
import { serve } from "./serve.js";

const VERSION = "0.1.0";

/** Path to the bundled MCP server entry point (sibling file in dist/) */
const mcpEntryPath = fileURLToPath(new URL("./mcp-entry.js", import.meta.url));

function configureMcp(projectDir: string): void {
  const mcpConfigPath = path.join(projectDir, ".mcp.json");

  const arosServer = {
    command: "node",
    args: [mcpEntryPath, "--project", projectDir],
  };

  let config: Record<string, unknown> = {};
  if (fs.existsSync(mcpConfigPath)) {
    try {
      config = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
    } catch {
      // Start fresh if corrupted
    }
  }

  const servers = (config.mcpServers as Record<string, unknown>) ?? {};
  servers["aros"] = arosServer;
  config.mcpServers = servers;

  fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2) + "\n");
}

const CLAUDE_MD_SECTION = `
## AROS Review Pipeline

This project uses AROS for AI deliverable review. When you produce work products (documents, code artifacts, images) that need human review, submit them through the AROS MCP tools:

1. \`submit_deliverable\` to create a review, attach files, and submit in one call (preferred)
2. \`check_status\` / \`get_feedback\` to check on reviews
3. \`submit_revision\` → \`complete_revision\` if revisions are requested

The AROS server must be running for the MCP tools to work.
`;

function configureClaudeMd(projectDir: string): void {
  const claudeMdPath = path.join(projectDir, "CLAUDE.md");
  let content = "";
  if (fs.existsSync(claudeMdPath)) {
    content = fs.readFileSync(claudeMdPath, "utf-8");
    if (content.includes("AROS Review Pipeline")) return;
    content = content.trimEnd() + "\n";
  }
  content += CLAUDE_MD_SECTION;
  fs.writeFileSync(claudeMdPath, content);
}

function printBanner(port: number, projectDir: string, startMs: number, firstRun: boolean): void {
  const elapsed = Math.round(performance.now() - startMs);
  const url = `http://localhost:${port}/`;

  console.log();
  console.log(
    `  ${pc.green(pc.bold("AROS"))} ${pc.green(`v${VERSION}`)}  ${pc.dim(`ready in ${pc.bold(String(elapsed))} ms`)}`
  );
  console.log();
  console.log(`  ${pc.green("➜")}  ${pc.bold("Local")}:    ${pc.cyan(`http://localhost:${pc.bold(String(port))}/`)}`);
  console.log(`  ${pc.green("➜")}  ${pc.bold("Project")}:  ${pc.dim(projectDir)}`);

  if (firstRun) {
    console.log();
    console.log(`  ${pc.green("✔")}  Configured ${pc.bold(".mcp.json")} ${pc.dim("— Claude Code will auto-discover AROS tools")}`);
    console.log(`  ${pc.green("✔")}  Updated ${pc.bold("CLAUDE.md")} ${pc.dim("— agents will know how to submit reviews")}`);
  }

  console.log();
}

const program = new Command();

program
  .name("aros")
  .description("AROS — Agent Review Orchestration Service")
  .version(VERSION);

// Default command: init (if needed) + serve
program
  .argument("[project]", "Project directory")
  .action(async (projectArg?: string) => {
    const startMs = performance.now();
    let projectDir: string;

    if (projectArg) {
      projectDir = path.resolve(projectArg);
    } else {
      // Check if current dir or ./aros is initialized
      const candidates = [process.cwd(), path.resolve("./aros")];
      let existing: string | undefined;
      for (const d of candidates) {
        const s = new Storage(d);
        if (await s.isInitialized()) {
          existing = d;
          break;
        }
      }
      if (existing) {
        projectDir = existing;
      } else {
        projectDir = await initProject();
      }
    }

    const storage = new Storage(projectDir);
    if (!(await storage.isInitialized())) {
      await storage.init();
    }

    // Configure MCP and CLAUDE.md for Claude Code on first run
    let firstRun = false;
    const mcpConfigPath = path.join(projectDir, ".mcp.json");
    if (!fs.existsSync(mcpConfigPath)) {
      configureMcp(projectDir);
      configureClaudeMd(projectDir);
      firstRun = true;
    }

    await serve(projectDir, (port) => {
      printBanner(port, projectDir, startMs, firstRun);
    });
  });

// MCP subcommand: used by agents via STDIO transport.
// This must yield stdin/stdout cleanly to the child process.
program
  .command("mcp")
  .description("Start MCP server (STDIO transport)")
  .requiredOption("--project <dir>", "Project directory")
  .action(async (opts) => {
    const { spawn } = await import("node:child_process");
    const child = spawn("node", [mcpEntryPath, "--project", opts.project], {
      stdio: "inherit", // Pass stdin/stdout through for JSON-RPC
    });
    child.on("exit", (code) => process.exit(code ?? 0));
  });

program.parse();
