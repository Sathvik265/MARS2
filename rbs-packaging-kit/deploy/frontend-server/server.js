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

app.use(express.static(buildDir));

// SPA fallback: any non-file route serves index.html so React Router works
app.get("*", (req, res) => {
  res.sendFile(path.join(buildDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Restaurant Billing frontend running on http://localhost:${PORT}`);
});
