const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// When bundled with pkg, 'build/' is embedded in the executable's virtual
// filesystem and resolved relative to __dirname just like a normal file.
const buildDir = path.join(__dirname, "build");

if (!fs.existsSync(buildDir)) {
  console.error(`Frontend build folder not found at ${buildDir}`);
  process.exit(1);
}

// MIME types map for static assets
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

// Custom static file handler that works 100% reliably inside pkg virtual filesystem
const serveFile = (filePath, res) => {
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = MIME_TYPES[ext] || "application/octet-stream";
      res.setHeader("Content-Type", mimeType);

      if (
        ext === ".js" ||
        ext === ".css" ||
        ext === ".png" ||
        ext === ".jpg" ||
        ext === ".woff2"
      ) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      return true;
    }
  } catch (err) {
    console.error("Error reading file:", filePath, err);
  }
  return false;
};

// Handle all incoming HTTP requests
app.use((req, res) => {
  let reqPath = req.path;
  try {
    reqPath = decodeURIComponent(req.path);
  } catch (e) {
    reqPath = req.path;
  }

  // 1. Direct file lookup in build directory (e.g., /static/js/main.js, /favicon.ico)
  const relativeFilePath = reqPath.startsWith("/") ? reqPath.slice(1) : reqPath;
  if (relativeFilePath) {
    const targetFile = path.join(buildDir, relativeFilePath);
    if (serveFile(targetFile, res)) {
      return;
    }
  }

  // 2. Look for static asset subpaths (e.g., /billing/static/js/main.js -> static/js/main.js)
  const staticIndex = reqPath.indexOf("/static/");
  if (staticIndex !== -1) {
    const cleanStaticPath = reqPath.substring(staticIndex + 1);
    const staticFile = path.join(buildDir, cleanStaticPath);
    if (serveFile(staticFile, res)) {
      return;
    }
  }

  // 3. For requests targeting static extensions (.js, .css, etc.) that do not exist: return proper MIME 404
  const ext = path.extname(reqPath).toLowerCase();
  if (MIME_TYPES[ext]) {
    res.setHeader("Content-Type", MIME_TYPES[ext]);
    return res.status(404).send(`/* File not found: ${reqPath} */`);
  }

  // 4. Fallback to index.html for all SPA routes (e.g. /, /billing, /reports)
  const indexHtmlPath = path.join(buildDir, "index.html");
  if (serveFile(indexHtmlPath, res)) {
    return;
  }

  res.status(500).send("index.html not found in build directory");
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Restaurant Billing frontend running on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      `❌ Port ${PORT} is already in use. Stop the process using this port or set a different PORT environment variable.`
    );
    process.exit(1);
  } else {
    console.error("Server error:", err);
    process.exit(1);
  }
});
