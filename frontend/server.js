const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Resolve build directory dynamically so disk updates take priority over embedded pkg snapshots
const exeDir = path.dirname(process.execPath);
const diskBuildCandidates = [
  path.join(process.cwd(), "build"),
  path.join(process.cwd(), "frontend", "build"),
  path.join(exeDir, "build"),
  path.join(exeDir, "frontend", "build"),
  path.join(__dirname, "build")
];

const buildDir = diskBuildCandidates.find(d => fs.existsSync(d)) || path.join(__dirname, "build");
console.log(`[Frontend Server] Serving static build from: ${buildDir}`);

if (!fs.existsSync(buildDir)) {
  console.error(`Frontend build folder not found at ${buildDir}`);
  process.exit(1);
}

app.use(express.static(buildDir));

app.get("*", (req, res) => {
  res.sendFile(path.join(buildDir, "index.html"));
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
