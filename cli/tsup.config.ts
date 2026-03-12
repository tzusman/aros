import { defineConfig } from "tsup";
import { builtinModules } from "node:module";

const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

const esmBanner = `#!/usr/bin/env node
import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);`;

const mcpBanner = `import { createRequire as __createRequire } from "node:module";
const require = __createRequire(import.meta.url);`;

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    target: "node20",
    platform: "node",
    splitting: false,
    clean: true,
    dts: false,
    noExternal: [/.*/],
    external: nodeBuiltins,
    banner: { js: esmBanner },
  },
  {
    entry: { "mcp-entry": "src/mcp-entry.ts" },
    format: ["esm"],
    target: "node20",
    platform: "node",
    splitting: false,
    dts: false,
    noExternal: [/.*/],
    external: nodeBuiltins,
    banner: { js: mcpBanner },
  },
]);
