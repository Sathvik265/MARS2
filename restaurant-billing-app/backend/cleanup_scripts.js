const fs = require("fs");
const files = [
  "check_settings_table.js",
  "check_shi.js",
  "dump_settings_schema.js",
  "repro_add_clerk.js",
  "verify_settings.js",
  "verify_shi_update.js",
  "settings_schema.txt",
  "cleanup_test.js",
];

files.forEach((f) => {
  if (fs.existsSync(f)) {
    fs.unlinkSync(f);
    console.log("Deleted", f);
  }
});
