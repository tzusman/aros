import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import pc from "picocolors";
import * as prompts from "@clack/prompts";
import { Storage } from "@aros/server";
import { serve } from "./serve.js";
import { registryCommands } from "./registry-cmd.js";
import { moduleCommands } from "./module-cmd.js";
import { onboard } from "./onboard.js";

const VERSION = "0.1.0";

/** Path to the bundled MCP server entry point (sibling file in dist/) */
const mcpEntryPath = fileURLToPath(new URL("./mcp-entry.js", import.meta.url));

function hasClaudeCli(): boolean {
  try {
    execSync("claude --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function configureMcp(projectDir: string): void {
  if (hasClaudeCli()) {
    try {
      execSync(
        `claude mcp add -s project aros -- node ${mcpEntryPath} --project ${projectDir}`,
        { cwd: projectDir, stdio: "ignore" }
      );
      return;
    } catch {
      // Fall back to manual .mcp.json if CLI fails
    }
  }

  // Fallback: write .mcp.json directly
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

function whitelistMcpTools(projectDir: string): void {
  const settingsDir = path.join(projectDir, ".claude");
  const settingsPath = path.join(settingsDir, "settings.json");

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    } catch {
      // Start fresh if corrupted
    }
  }

  const permissions = (settings.permissions as Record<string, unknown>) ?? {};
  const allow = (permissions.allow as string[]) ?? [];

  const rule = "mcp__aros__*";
  if (!allow.includes(rule)) {
    allow.push(rule);
  }

  permissions.allow = allow;
  settings.permissions = permissions;

  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
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

interface FirstRunResult {
  configured: boolean;
  whitelisted: boolean;
}

async function firstRunSetup(
  projectDir: string,
  storage: Storage,
): Promise<FirstRunResult> {
  const result: FirstRunResult = { configured: false, whitelisted: false };

  console.log();
  console.log(
    `  ${pc.cyan(pc.bold("Install AROS"))} ${pc.dim("for")} ${pc.bold(path.basename(projectDir))}`
  );
  console.log();

  console.log(pc.dim("  This will:"));
  console.log(pc.dim("  • Register MCP tools with Claude Code"));
  console.log(pc.dim("  • Auto-approve AROS tool calls (skip permission prompts)"));
  console.log();

  const confirm = await prompts.confirm({
    message: "Install AROS into Claude Code?",
    initialValue: true,
  });

  if (prompts.isCancel(confirm) || !confirm) return result;

  configureMcp(projectDir);
  configureClaudeMd(projectDir);
  result.configured = true;

  whitelistMcpTools(projectDir);
  result.whitelisted = true;

  // Install policies and demo files
  await onboard(projectDir, storage);

  return result;
}

function openBrowser(url: string): void {
  try {
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    execSync(`${cmd} ${url}`, { stdio: "ignore" });
  } catch {
    // Non-fatal — user can open manually
  }
}

function printBanner(
  port: number,
  projectDir: string,
  startMs: number,
  firstRun: FirstRunResult | null
): void {
  const elapsed = Math.round(performance.now() - startMs);
  const url = `http://localhost:${port}/`;

  console.log();
  console.log(
    `  ${pc.green(pc.bold("AROS"))} ${pc.green(`v${VERSION}`)}  ${pc.dim(`ready in ${pc.bold(String(elapsed))} ms`)}`
  );
  console.log();
  console.log(
    `  ${pc.green("➜")}  ${pc.bold("Dashboard")}:  ${pc.cyan(`http://localhost:${pc.bold(String(port))}/`)}`
  );
  console.log(
    `  ${pc.green("➜")}  ${pc.bold("Project")}:    ${pc.dim(projectDir)}`
  );

  if (firstRun?.configured) {
    console.log();
    console.log(
      `  ${pc.green("✔")}  Registered MCP tools ${pc.dim("— Claude Code will auto-discover AROS")}`
    );
    console.log(
      `  ${pc.green("✔")}  Updated ${pc.bold("CLAUDE.md")} ${pc.dim("— agents will know how to submit reviews")}`
    );
    if (firstRun.whitelisted) {
      console.log(
        `  ${pc.green("✔")}  Whitelisted tool calls ${pc.dim("— no permission prompts for AROS")}`
      );
    }
  }

  console.log();

  if (firstRun) {
    openBrowser(url + "review?onboard");
  }
}

const program = new Command();

program
  .name("aros")
  .description("AROS — Agent Review Orchestration Service")
  .version(VERSION);

// Default command: init (if needed) + serve
program
  .argument("[project]", "Project directory")
  .action(async (projectArg: string | undefined) => {
    const startMs = performance.now();
    let projectDir: string;

    projectDir = path.resolve(projectArg ?? process.cwd());

    const storage = new Storage(projectDir);
    const wasInitialized = await storage.isInitialized();

    if (!wasInitialized) {
      await storage.init();
    }

    // First-run setup: unified install prompt
    let firstRun: FirstRunResult | null = null;
    if (!wasInitialized) {
      firstRun = await firstRunSetup(projectDir, storage);
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

registryCommands(program);
moduleCommands(program);

program.parse();
