const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Build is embedded inside the executable at __dirname/build via pkg assets.
// This matches the proven working build from rbs-apps-only.zip.
const buildDir = path.join(__dirname, "build");

if (!fs.existsSync(buildDir)) {
  console.error(`[RBS Frontend] Build folder not found at: ${buildDir}`);
  process.exit(1);
}

console.log(`[RBS Frontend] Serving build from: ${buildDir}`);

app.use(express.static(buildDir));

app.get("*", (req, res) => {
  res.sendFile(path.join(buildDir, "index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`Restaurant Billing frontend running on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    process.exit(1);
  } else {
    console.error("Server error:", err);
    process.exit(1);
  }
});
