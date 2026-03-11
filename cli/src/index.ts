#!/usr/bin/env node
import * as path from "node:path";
import { createRequire } from "node:module";
import { Command } from "commander";
import { Storage } from "@aros/server";
import { initProject } from "./init.js";
import { serve } from "./serve.js";

const require = createRequire(import.meta.url);

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

program.parse();
