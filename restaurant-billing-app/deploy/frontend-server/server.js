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

// Serve static assets under /static explicitly with fallthrough: false
app.use("/static", express.static(path.join(buildDir, "static"), {
  fallthrough: false,
  immutable: true,
  maxAge: "1y",
}));

// Catch any subpath static asset requests (e.g. /subpath/static/*)
app.use("*/static", (req, res, next) => {
  const relPath = req.url;
  const targetFile = path.join(buildDir, "static", relPath);
  if (fs.existsSync(targetFile)) {
    return res.sendFile(targetFile);
  }
  next();
});

// Serve root build directory files (favicon, manifest, icons)
app.use(express.static(buildDir));

// Return 404 for missing static JS/CSS assets rather than falling through to index.html
app.use((req, res, next) => {
  if (req.url.match(/\.(js|css|json|png|jpg|jpeg|gif|ico|svg|ttf|woff|woff2)$/)) {
    return res.status(404).send("Asset not found");
  }
  next();
});

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
