const fs = require("fs");
try {
  if (fs.existsSync("cleanup_schema_scripts.js"))
    fs.unlinkSync("cleanup_schema_scripts.js");
} catch (e) {}
