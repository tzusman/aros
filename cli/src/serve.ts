import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import * as prompts from "@clack/prompts";
import pc from "picocolors";
import { createServer } from "@aros/server";

/** Check if a port is available */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port);
  });
}

/** Find the next available port starting from `start` */
async function findFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 100; port++) {
    if (await isPortFree(port)) return port;
  }
  return start + 100;
}

export async function serve(projectDir: string, onReady?: (port: number) => void) {
  // Look for built dashboard relative to this package
  const dashboardDir = findDashboardDist();

  const server = createServer({
    projectDir,
    dashboardDir,
  });

  // Try to start, handle port conflicts
  let started = false;
  while (!started) {
    try {
      await server.start();
      started = true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        const port = server.port;
        const nextFree = await findFreePort(port + 1);

        console.log();
        console.log(`  ${pc.yellow("!")}  Port ${pc.bold(String(port))} is already in use`);
        console.log();

        const answer = await prompts.confirm({
          message: `Use port ${pc.bold(String(nextFree))} instead?`,
        });

        if (prompts.isCancel(answer) || !answer) {
          process.exit(1);
        }

        await server.start(nextFree);
        started = true;
      } else {
        throw err;
      }
    }
  }

  if (onReady) {
    onReady(server.port);
  }

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
