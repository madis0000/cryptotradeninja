import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";
import { nanoid } from "nanoid";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  try {
    // Only run in development - check environment variables
    if (process.env.NODE_ENV === 'production' || process.env.DEPLOYMENT) {
      throw new Error('Vite setup should not run in production');
    }

    // Dynamic import to avoid bundling Vite in production
    const { createServer: createViteServer } = await import("vite");

    // Use minimal inline config instead of importing vite.config
    // to avoid bundling vite dependencies in production
    const vite = await createViteServer({
      root: path.resolve(__dirname, "../client"),
      server: {
        middlewareMode: true,
        hmr: { server },
      },
      resolve: {
        alias: {
          "@": path.resolve(__dirname, "../client/src"),
          "@shared": path.resolve(__dirname, "../shared"),
          "@assets": path.resolve(__dirname, "../attached_assets"),
        },
      },
    });

    app.use(vite.middlewares);
    log("Vite development server initialized");
  } catch (error) {
    console.error("Failed to setup Vite:", error);
    throw error;
  }
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "../dist");
  const publicPath = path.resolve(__dirname, "../dist/public");

  log(`Serving static files from ${distPath}`);

  // Serve static files
  app.use(express.static(distPath));
  app.use("/assets", express.static(path.join(distPath, "assets")));

  // Serve index.html for all routes (SPA)
  app.get("*", (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith("/api")) {
      return next();
    }

    const indexPath = path.join(distPath, "index.html");

    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Not found");
    }
  });
}
