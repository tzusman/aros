import { defineConfig } from "tsup";
import { builtinModules } from "node:module";
import { cpSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    onSuccess: async () => {
      const src = resolve(__dirname, "../registry/policies");
      const dest = resolve(__dirname, "dist/registry/policies");
      mkdirSync(dest, { recursive: true });
      cpSync(src, dest, { recursive: true });

      const demoSrc = resolve(__dirname, "../.aros/demo");
      const demoDest = resolve(__dirname, "dist/demo");
      mkdirSync(demoDest, { recursive: true });
      cpSync(demoSrc, demoDest, { recursive: true });
    },
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
