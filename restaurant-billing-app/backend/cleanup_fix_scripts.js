const fs = require("fs");
const files = [
  "check_bad_categories.js",
  "check_items_schema.js",
  "fix_items_category.js",
  "fix_items_category_v2.js",
];

files.forEach((f) => {
  try {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } catch (e) {}
});
