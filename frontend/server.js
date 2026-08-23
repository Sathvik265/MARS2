const express = require("express");
const path = require("path");
const fs = require("fs");
const http = require("http");

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_PORT = process.env.BACKEND_PORT || 8000;
const BACKEND_HOST = process.env.BACKEND_HOST || "127.0.0.1";

// Build directory resolution:
// 1. If an external 'build' folder exists next to the executable on disk (exeDir/build) with files in it, use it.
// 2. Otherwise, use embedded pkg snapshot directory (__dirname/build).
const exeDir = path.dirname(process.execPath);
const diskBuild = path.join(exeDir, "build");

let buildDir = path.join(__dirname, "build");
if (fs.existsSync(diskBuild)) {
  try {
    if (fs.readdirSync(diskBuild).length > 0) {
      buildDir = diskBuild;
    }
  } catch (e) {}
}

console.log(`[Frontend Server] Serving static build from: ${buildDir}`);

if (!fs.existsSync(buildDir)) {
  console.error(`Frontend build folder not found at ${buildDir}`);
  process.exit(1);
}

// 1. Reverse proxy /api requests to backend (port 8000) so relative API requests never fallback to index.html
app.use("/api", (req, res) => {
  const options = {
    hostname: BACKEND_HOST,
    port: BACKEND_PORT,
    path: `/api${req.url}`,
    method: req.method,
    headers: { ...req.headers, host: `${BACKEND_HOST}:${BACKEND_PORT}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error(`API Proxy Error [${req.method} ${req.url}]:`, err.message);
    res.status(502).json({
      detail: "Backend service unavailable. Please check if rbs-backend.exe is running on port 8000.",
      error: err.message,
    });
  });

  req.pipe(proxyReq, { end: true });
});

// 2. Serve static assets
app.use(express.static(buildDir));

// 3. SPA Fallback: Only send index.html for non-API, non-asset requests (no file extensions)
app.get("*", (req, res) => {
  const ext = path.extname(req.path);
  if (ext && ext !== ".html") {
    console.warn(`[Frontend Server] Static asset not found (404): ${req.path}`);
    return res.status(404).send(`Asset not found: ${req.path}`);
  }
  const indexPath = path.join(buildDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.error(`[Frontend Server] index.html missing at ${indexPath}`);
    return res.status(500).send("index.html missing in build folder");
  }
  res.sendFile(indexPath);
});

const server = app.listen(PORT, () => {
  console.log(`Restaurant Billing frontend running on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use. Stop the process using this port or set a different PORT environment variable.`);
    process.exit(1);
  } else {
    console.error("Server error:", err);
    process.exit(1);
  }
});
