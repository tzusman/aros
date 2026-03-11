import * as path from "path";
import express from "express";
import { Storage } from "./storage.js";
import { PipelineEngine } from "./pipeline/engine.js";
import { SSEBroadcaster } from "./sse.js";
import { registerDriver } from "./notifications/driver.js";
import { paperclipDriver } from "./notifications/paperclip.js";
import { deliverableRoutes } from "./routes/deliverables.js";
import { fileRoutes } from "./routes/files.js";
import { pipelineRoutes } from "./routes/pipeline.js";
import { policyRoutes } from "./routes/policies.js";
import { errorHandler } from "./errors.js";

export interface ServerOptions {
  projectDir: string;
  port?: number;
  dashboardDir?: string;
}

export function createServer(options: ServerOptions) {
  const { projectDir, dashboardDir } = options;

  // 1. Create Storage
  const storage = new Storage(projectDir);

  // 2. Register PaperclipDriver
  registerDriver(paperclipDriver);

  // 3. Create SSEBroadcaster and PipelineEngine with emit fn
  const sse = new SSEBroadcaster();
  const emitFn = (event: string, data: Record<string, unknown>) => {
    sse.emit(event, data);
  };
  const engine = new PipelineEngine(storage, emitFn);

  // 4. Create Express app with JSON body parser (50mb limit)
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  // 5. CORS middleware (allow all origins for dev)
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (_req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Compute API base URL from port (resolved at listen time)
  let resolvedPort = options.port ?? 4100;
  const getApiBaseUrl = () => `http://localhost:${resolvedPort}`;

  // 6. Mount routes
  app.use("/api/deliverables", deliverableRoutes(storage, engine, getApiBaseUrl()));
  app.use("/api/deliverables", fileRoutes(storage));
  app.use("/api/pipeline", pipelineRoutes(storage));
  app.use("/api/policies", policyRoutes(storage));

  // 7. SSE endpoint
  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    sse.addClient(res);

    // 30s heartbeat
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30_000);

    req.on("close", () => {
      clearInterval(heartbeat);
    });
  });

  // 8. Serve dashboard static files if dashboardDir provided
  if (dashboardDir) {
    app.use(express.static(dashboardDir));
    // Fallback for SPA routing (Express 5 requires named param)
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(dashboardDir, "index.html"));
    });
  }

  // 9. Central error handler (must be last middleware)
  app.use(errorHandler);

  // Server lifecycle
  let server: ReturnType<typeof app.listen> | null = null;

  const start = async (): Promise<void> => {
    await storage.init();

    // Read config for port (prefer config, then options.port, then default)
    try {
      const config = await storage.getConfig();
      resolvedPort = options.port ?? config.port ?? 4100;
    } catch {
      resolvedPort = options.port ?? 4100;
    }

    // Start file watcher on .aros/ directory
    sse.startWatching(path.join(options.projectDir, ".aros"));

    return new Promise((resolve) => {
      server = app.listen(resolvedPort, () => {
        resolve();
      });
    });
  };

  const stop = async (): Promise<void> => {
    sse.stop();
    return new Promise((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };

  return {
    app,
    storage,
    engine,
    sse,
    start,
    stop,
    get port() {
      return resolvedPort;
    },
  };
}

// Re-export key classes
export { Storage } from "./storage.js";
export { PipelineEngine } from "./pipeline/engine.js";
export { HttpError, badRequest, notFound, conflict, unprocessable, errorHandler } from "./errors.js";
