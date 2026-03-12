import * as fs from "node:fs";
import * as path from "node:path";
import { buildSync } from "esbuild";

export function compileCheckModule(modulePath: string): void {
  const entrypoint = path.join(modulePath, "check.ts");
  if (!fs.existsSync(entrypoint)) return;
  buildSync({
    entryPoints: [entrypoint],
    outfile: path.join(modulePath, "check.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    external: ["node:*"],
  });
}
