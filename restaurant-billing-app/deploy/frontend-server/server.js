const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the React build from a 'build' folder located next to the running exe.
// This avoids any pkg VFS / asset-embedding issues entirely.
// When running as a packaged exe: process.execPath = C:\...\rbs-frontend.exe
//   → buildDir = C:\...\build\
// When running directly with node (dev): __dirname\build\
const exeDir = path.dirname(
  process.pkg ? process.execPath : path.resolve(__filename)
);
const buildDir = path.join(exeDir, "build");

if (!fs.existsSync(buildDir)) {
  console.error(`[RBS Frontend] Build folder not found at: ${buildDir}`);
  console.error(`[RBS Frontend] Make sure the 'build' folder is in the same directory as rbs-frontend.exe`);
  process.exit(1);
}

if (!fs.existsSync(path.join(buildDir, "index.html"))) {
  console.error(`[RBS Frontend] index.html not found in: ${buildDir}`);
  console.error(`[RBS Frontend] The build folder appears to be empty or corrupt.`);
  process.exit(1);
}

console.log(`[RBS Frontend] Serving React build from: ${buildDir}`);

app.use(express.static(buildDir));

app.get("*", (req, res) => {
  res.sendFile(path.join(buildDir, "index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`Restaurant Billing frontend running on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Please close the other process or set a different PORT.`);
    process.exit(1);
  } else {
    console.error("Server error:", err);
    process.exit(1);
  }
});
