import * as fs from "node:fs";
import * as path from "node:path";
import { createServer } from "@aros/server";

export async function serve(projectDir: string) {
  // Look for built dashboard relative to this package
  const dashboardDir = findDashboardDist();

  const server = createServer({
    projectDir,
    dashboardDir,
  });

  await server.start();

  console.log(`  ● AROS serving ${projectDir}`);
  console.log(`  ● Dashboard:   http://localhost:${server.port}`);
  console.log(`  ● MCP command:  npx aros mcp --project ${projectDir}`);

  // Handle shutdown
  process.on("SIGINT", () => {
    server.stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    server.stop();
    process.exit(0);
  });
}

function findDashboardDist(): string | undefined {
  // Try several locations relative to cli package
  const here = new URL(".", import.meta.url).pathname;
  const candidates = [
    path.resolve(here, "../../dashboard/dist"),
    path.resolve(here, "../../../dashboard/dist"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "index.html"))) return dir;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}
