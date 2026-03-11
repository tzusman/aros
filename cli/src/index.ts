#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { Command } from "commander";
import { Storage } from "@aros/server";
import { initProject } from "./init.js";
import { serve } from "./serve.js";
import { registryCommands } from "./registry-cmd.js";

const require = createRequire(import.meta.url);

function configureMcp(projectDir: string): void {
  const mcpConfigPath = path.join(projectDir, ".mcp.json");
  const mcpEntry = require.resolve("@aros/mcp");

  const arosServer = {
    command: "node",
    args: [mcpEntry, "--project", projectDir],
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
  console.log(`  ● MCP config:  ${mcpConfigPath}`);
}

const CLAUDE_MD_SECTION = `
## AROS Review Pipeline

This project uses AROS for AI deliverable review. When you produce work products (documents, code artifacts, images) that need human review, submit them through the AROS MCP tools:

1. \`create_review\` → \`add_file\` → \`submit_for_review\` to submit work
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
  console.log(`  ● CLAUDE.md:   ${claudeMdPath}`);
}

const program = new Command();

program
  .name("aros")
  .description("AROS — Agent Review Orchestration Service")
  .version("0.1.0");

// Default command: init (if needed) + serve
program
  .argument("[project]", "Project directory")
  .action(async (projectArg?: string) => {
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
    const mcpConfigPath = path.join(projectDir, ".mcp.json");
    if (!fs.existsSync(mcpConfigPath)) {
      configureMcp(projectDir);
      configureClaudeMd(projectDir);
    }

    await serve(projectDir);
  });

// MCP subcommand: used by agents via STDIO transport.
// This must yield stdin/stdout cleanly to the child process.
program
  .command("mcp")
  .description("Start MCP server (STDIO transport)")
  .requiredOption("--project <dir>", "Project directory")
  .action(async (opts) => {
    const { spawn } = await import("node:child_process");
    const mcpEntry = require.resolve("@aros/mcp");
    const child = spawn("node", [mcpEntry, "--project", opts.project], {
      stdio: "inherit", // Pass stdin/stdout through for JSON-RPC
    });
    child.on("exit", (code) => process.exit(code ?? 0));
  });

registryCommands(program);

program.parse();
