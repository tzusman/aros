import type { Response } from "express";
import { watch, type FSWatcher } from "chokidar";

export class SSEBroadcaster {
  private clients = new Set<Response>();
  private watcher: FSWatcher | null = null;

  addClient(res: Response): void {
    this.clients.add(res);
    res.on("close", () => {
      this.clients.delete(res);
    });
  }

  emit(event: string, data: Record<string, unknown>): void {
    const payload = JSON.stringify({ type: event, data });
    const message = `data: ${payload}\n\n`;
    for (const client of this.clients) {
      client.write(message);
    }
  }

  startWatching(reviewDir: string): void {
    if (this.watcher) {
      void this.watcher.close();
    }
    this.watcher = watch(reviewDir, {
      persistent: false,
      ignoreInitial: true,
      depth: 3,
    });
    this.watcher.on("change", (filePath: string) => {
      if (filePath.endsWith("status.json")) {
        this.emit("fs:changed", { path: filePath });
      }
    });
  }

  stop(): void {
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = null;
    }
    this.clients.clear();
  }
}
