import { Router } from "express";
import * as fs from "fs";
import mime from "mime-types";
import type { Storage } from "../storage.js";

export function fileRoutes(storage: Storage): Router {
  const router = Router();

  // GET /:id/files/:filename — serve file
  router.get("/:id/files/:filename", async (req, res, next) => {
    try {
      const { id, filename } = req.params;
      const filePath = await storage.getFilePath(id, filename);

      if (!filePath) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const contentType = mime.lookup(filename) || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-cache");

      const stream = fs.createReadStream(filePath);
      stream.on("error", next);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
