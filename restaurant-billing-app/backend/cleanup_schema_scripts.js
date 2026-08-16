const fs = require("fs");
const files = ["dump_full_schema.js", "schema_dump.json"];

files.forEach((f) => {
  try {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } catch (e) {}
});
