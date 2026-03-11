import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    target: "node20",
    platform: "node",
    splitting: false,
    clean: true,
    dts: false,
    noExternal: ["@aros/server", "@aros/mcp", "@aros/types"],
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: { "mcp-entry": "src/mcp-entry.ts" },
    format: ["esm"],
    target: "node20",
    platform: "node",
    splitting: false,
    dts: false,
    noExternal: ["@aros/server", "@aros/mcp", "@aros/types"],
  },
]);
