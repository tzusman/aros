#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Storage } from "@aros/server/storage.js";
import { PipelineEngine } from "@aros/server/pipeline/engine.js";
import { registerDriver } from "@aros/server/notifications/driver.js";
import { paperclipDriver } from "@aros/server/notifications/paperclip.js";
import { registerAllTools } from "./tools/index.js";

// Parse --project arg
const projectDir =
  process.argv.find((_, i, arr) => arr[i - 1] === "--project") ??
  process.cwd();

const storage = new Storage(projectDir);

storage.isInitialized().then((initialized) => {
  if (!initialized) {
    console.error(
      `[AROS MCP] Project not initialized at ${projectDir}. Run 'npx aros' first.`
    );
    process.exit(1);
  }

  registerDriver(paperclipDriver);
  const engine = new PipelineEngine(storage);

  const server = new McpServer({ name: "aros", version: "0.1.0" });
  registerAllTools(server, storage, engine);

  const transport = new StdioServerTransport();
  server.connect(transport).catch((err: unknown) => {
    console.error("[AROS MCP] Failed:", err);
    process.exit(1);
  });
});
